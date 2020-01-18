# Homebridge Plugin for Switcher
## Introduction
Homebridge Plugin for Switch makes your [Switcher](https://try.i-o.studio/#/switcher) device attachble to Apple HomeKit
## Requirements
- Switcher device, of course
- Server with BLE-enabled Bluetooth module equiped
- on macOS
    - Xcode installed and configured
- on Linux
    - Follow prequisites on [this repository](https://github.com/noble/noble)
## Installation
1. Install plugin with `yarn global add homebridge-ioswitcher`.
2. Fill in homebridge's `config.json`: 
```
{
    "accessory": "Switcher",
    "name": "<Your switcher name>",
    "serial": "<8 character S/N>",
    "buttonType": "<one|two>"
}
```
3. Start Homebridge.
## Troubleshooting
- How do I choose `buttonType`?
    - If your Switcher is One-buttoned type, your `buttonType` is `one`.
    - Otherwise, your `buttonType` is `two`.
- Where can I find `serial`?
    - Check back of your Switcher package box. There, you'll see 8 character long S/N below product barcode.
- Can I use official Switcher App(I/O) while controlling Switcher with Homebridge?
    - No.
- How do I check if my Switcher is connected to Homebridge?
    - You can see your switcher's MAC address and F/W version on your Homebridge log.
