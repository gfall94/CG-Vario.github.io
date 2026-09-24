#pragma once
#include "FlashIAPBlockDevice.h"
#include "TDBStore.h"
#include "Control.h"
namespace ez {
// Dedicated final two nRF52832 flash pages. Never touch Nicla's external flash
// (it contains sensor-hub firmware). Refuse access if the application overlaps.
class SettingsStore {
  FlashIAPBlockDevice flash{0x7e000,8192};
  mbed::TDBStore store{&flash};
  bool ready=false,hasLast=false;
  uint8_t last[CONTROL_SIZE]={};
 public:
  bool begin(Settings& settings){
    const uintptr_t imageEnd=(uintptr_t)&__etext+((uintptr_t)&__data_end__-(uintptr_t)&__data_start__);
    if(imageEnd>0x7e000)return false;
    ready=store.init()==0;if(!ready)return false;
    uint8_t data[CONTROL_SIZE];size_t actual=0;
    if(store.get("config-v2",data,sizeof(data),&actual)==0&&actual==sizeof(data)&&data[0]=='E'&&data[1]=='S'&&data[2]==2){
      auto loaded=readSettings(data);
      if(loaded.valid()){settings=loaded;memcpy(last,data,sizeof(last));hasLast=true;}
    }
    return true;
  }
  bool save(const Settings& s){
    if(!ready)return false;
    uint8_t data[CONTROL_SIZE];encodeSettings(data,s,0,0,0);
    if(hasLast&&memcmp(last,data,sizeof(data))==0)return true;
    // TDBStore is append-only with CRC and two-bank garbage collection.
    if(store.set("config-v2",data,sizeof(data),0)!=0)return false;
    uint8_t check[CONTROL_SIZE];size_t actual=0;
    if(store.get("config-v2",check,sizeof(check),&actual)!=0||actual!=sizeof(check)||memcmp(data,check,sizeof(data)))return false;
    memcpy(last,data,sizeof(last));hasLast=true;return true;
  }
};
}
