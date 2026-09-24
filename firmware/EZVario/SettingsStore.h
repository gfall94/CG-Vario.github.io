#pragma once
#include "FlashIAP.h"
#include "Control.h"
#include <stddef.h>
namespace ez {

// Cordio needs one contiguous 13,000-byte allocation from the Nicla's small
// heap. Keep persistence allocation-free: two alternating flash sectors make
// an interrupted write recoverable without the RAM overhead of TDBStore.
class SettingsStore {
  static constexpr uint32_t SLOT0=0x7e000;
  static constexpr uint32_t SLOT1=0x7f000;
  static uint32_t slot(uint8_t index){return index?SLOT1:SLOT0;}
  static constexpr uint32_t MAGIC=0x455A5632; // "EZV2"
  struct Record {
    uint32_t magic;
    uint32_t generation;
    uint16_t size;
    uint8_t version;
    uint8_t reserved;
    uint8_t data[CONTROL_SIZE];
    uint32_t checksum;
  };
  static_assert(sizeof(Record)==164,"Flash record must stay word aligned");

  bool ready=false,hasLast=false;
  uint8_t active=0;
  uint32_t generation=0;
  uint8_t last[CONTROL_SIZE]={};
  static uint32_t crc(const uint8_t* data,size_t size) {
    uint32_t value=0xffffffffu;
    while(size--){value^=*data++;for(unsigned bit=0;bit<8;bit++)value=(value>>1)^(0xedb88320u&-(value&1u));}
    return ~value;
  }
  static uint32_t recordCrc(const Record& r) {
    return crc(reinterpret_cast<const uint8_t*>(&r.generation),offsetof(Record,checksum)-offsetof(Record,generation));
  }
  static bool valid(const Record& r) {
    return r.magic==MAGIC&&r.size==CONTROL_SIZE&&r.version==2&&r.checksum==recordCrc(r)&&
           r.data[0]=='E'&&r.data[1]=='S'&&r.data[2]==2&&readSettings(r.data).valid();
  }
  static bool newer(uint32_t a,uint32_t b){return static_cast<int32_t>(a-b)>0;}

 public:
  bool begin(Settings& settings){
    if(FLASHIAP_APP_ROM_END_ADDR>SLOT0)return false;
    mbed::FlashIAP flash;
    if(flash.init()!=0)return false;
    const bool geometry=flash.get_sector_size(SLOT0)==0x1000&&flash.get_sector_size(SLOT1)==0x1000&&
                        sizeof(Record)%flash.get_page_size()==0;
    Record records[2];
    const bool read0=geometry&&flash.read(&records[0],SLOT0,sizeof(Record))==0;
    const bool read1=geometry&&flash.read(&records[1],SLOT1,sizeof(Record))==0;
    flash.deinit();
    if(!geometry)return false;
    const bool valid0=read0&&valid(records[0]),valid1=read1&&valid(records[1]);
    if(valid0||valid1){
      active=valid1&&(!valid0||newer(records[1].generation,records[0].generation));
      const Record& selected=records[active];
      settings=readSettings(selected.data);generation=selected.generation;
      memcpy(last,selected.data,sizeof(last));hasLast=true;
    }
    ready=true;
    return true;
  }
  bool save(const Settings& s){
    if(!ready)return false;
    Record record={};
    record.magic=MAGIC;record.generation=generation+1;record.size=CONTROL_SIZE;record.version=2;
    encodeSettings(record.data,s,0,0,0);record.checksum=recordCrc(record);
    if(hasLast&&memcmp(last,record.data,sizeof(last))==0)return true;
    const uint8_t target=hasLast?active^1u:0;
    mbed::FlashIAP flash;
    if(flash.init()!=0)return false;
    bool ok=flash.erase(slot(target),0x1000)==0&&flash.program(&record,slot(target),sizeof(record))==0;
    Record check={};
    ok=ok&&flash.read(&check,slot(target),sizeof(check))==0&&valid(check)&&memcmp(&record,&check,sizeof(record))==0;
    flash.deinit();
    if(!ok)return false;
    active=target;generation=record.generation;memcpy(last,record.data,sizeof(last));hasLast=true;
    return true;
  }
};
}
