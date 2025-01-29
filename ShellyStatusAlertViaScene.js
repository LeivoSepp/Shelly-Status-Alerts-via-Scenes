/*
Created by Leivo Sepp, 2025
Licensed under the MIT License
https://github.com/LeivoSepp/Shelly-Device-Status-Alerts-via-Scenes

Shelly Device Status Alerts via Scenes

This script tracks the online status of remote Shelly devices and 
triggers Shelly scenes to notify users when devices go offline or come back online.

How to get the API key and URL:
1. Go to https://control.shelly.cloud/
2. Click on the Settings tab
3. Click on the "Authorization cloud key"
4. Click on the Get key button
5. Copy the key and save it in the KVS
6. Copy the Shelly cloud URL and save it in the KVS

How to get the SceneId:
1. Go to https://control.shelly.cloud/
2. Click on the Scenes tab
3. Click on the scene you want to use
4. Click on the Informaton tab
5. Copy the Scene ID and save it in the KVS
6. Repeat the steps for the other scene

How to get the device id:
1. Go to https://control.shelly.cloud/
2. Click on the room where the device is located
3. Click on the device you want to use
4. Click on the Device Settings tab
5. Open Device Information
6. Copy the DeviceId (MAC address) and save it in the script
7. Repeat the steps for the other devices
8. Do not use more than 5 devices in the script as it may cause memory issues

Please set the following parameters in the KVS after the initial run of the script:
Do not share the API key with anyone.
{
  "url": "https://xxx-xx-xx.shelly.cloud/",
  "apiKey": "your API key",
  "SceneIdOffline": "SceneId",
  "SceneIdOnline": "SceneId",
  "Version": "1.0"
}

Please set the devices in the CONF.dvsc array. 
The id is the device id (mac address) and the name is anything you like to call it.
{ id: "1234567890", name: "My garage Pro 3EM" },

The script will check the online status and loop to next device in 30 seconds.
If all devices are offline, the scene with the id CONF.scOf will be triggered.
If one devices are back online, the scene with the id CONF.scOn will be triggered.

There are two non documented API calls that can be used to manage Shelly scenes.
- scene/manual_run?auth_key=apiKey&id=SceneId
- scene/enable?enabled=true&auth_key=apiKey&id=SceneId
- scene/enable?enabled=false&auth_key=apiKey&id=SceneId
*/

const CONF = {
    dvsc: [
        { id: "123456789", name: "Nibe heating" },
        { id: "123456789", name: "Main Pro 3EM" },
        { id: "123456789", name: "Garage Shelly" },
    ],
    ping: 60,       //time in seconds before next device check 
    url: '',        //url to the Shelly cloud
    apiK: '',       //API key
    scOf: '',       //scene id for offline
    scOn: '',       //scene id for online
    sRun: "scene/manual_run",
    ver: "1.0",
};

let noFl = CONF.dvsc.length;  //# of devices after which the scene is triggered
let dIdx = 0;       //device index
let fCnt = 0;       //failure counter
let fail = false;   //is failure
let ok = true;      //is ok

const sId = Shelly.getCurrentScriptId();

function strt() {
    if (!Shelly.getComponentConfig("script", sId).enable) {
        Shelly.call('Script.SetConfig', { id: sId, config: { enable: true } });
    }
}

function getK() {
    Shelly.call('KVS.Get', { key: "Configuration" + sId },
        function (res, err) {
            if (err !== 0) {
                // Failed to get ConfigurationData
                let val = {
                    url: "url",
                    apiKey: "your API key",
                    SceneIdOffline: "scene id",
                    SceneIdOnline: "scene id",
                    Version: CONF.ver
                };
                print("API key andother configuration parameters are not set, please set them in the KVS.");
                Shelly.call('KVS.Set', { key: "Configuration" + sId, value: JSON.stringify(val) });
                Shelly.call('Script.Stop', { id: sId });
                return;
            }
            CONF.apiK = JSON.parse(res.value).apiKey;
            CONF.url = JSON.parse(res.value).url;
            CONF.scOf = JSON.parse(res.value).SceneIdOffline;
            CONF.scOn = JSON.parse(res.value).SceneIdOnline;
        });
}
function Scen(id) {
    const url = CONF.url + CONF.sRun + "?auth_key=" + CONF.apiK + "&id=" + id;
    Shelly.call(
        "HTTP.GET", {
        "url": url,
        "content_type": " application/json",
    }, function (res, err) {
        if (err !== 0 || res === null || res.code != 200) {
            print(err);
            return;
        }
        print(JSON.parse(res.body).isok ? "Scene executed" : "Scene was not executed");
    });
}

function pngD() {
    Shelly.call(
        "HTTP.POST", {
        "url": CONF.url + "device/status ",
        "content_type": " application/json",
        "body": JSON.stringify({ id: CONF.dvsc[dIdx].id, auth_key: CONF.apiK }),
    }, function (res, err) {
        if (err !== 0 || res === null || res.code != 200) {
            print(err);
            return;
        }
        let json = JSON.parse(res.body);
        res = null; //free memory

        if (!json.isok || !json.data.online) {
            fCnt++;
            print(CONF.dvsc[dIdx].name, "is offline.");
        } else {
            fail = false;
            print(CONF.dvsc[dIdx].name, "is online.");
        }
        json = null; //free memory
        print(dIdx === CONF.dvsc.length - 1 ? fCnt + " device(s) out of " + noFl + " are offline." : "");

        dIdx++;
        dIdx = dIdx % CONF.dvsc.length;

        if (!ok && !fail) {
            print("Device(s) are back online.");
            Scen(CONF.scOn);
            ok = true;
            return;
        }

        if (fCnt >= noFl && !fail) {
            print("All devices are offline.");
            fCnt = 0;
            fail = true;
            ok = false;
            Scen(CONF.scOf);
            return;
        }
        fCnt = dIdx === 0 ? 0 : fCnt;
    });
}

strt();
getK();
Timer.set(CONF.ping * 1000, true, pngD);