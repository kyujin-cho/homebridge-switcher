require("@babel/polyfill")
import { callbackify } from "./utils"
// @ts-ignore
import { Peripheral as _Peripheral, Characteristic as _Characteristic } from 'noble'
let Accessory: any, HMService: any, HMCharacteristic: any, UUIDGen: any

const noble = require('__NOBLEPKGNAME__')

const UUID_POSTFIX = '0000-1000-8000-00805F9B34FB'
const BATTERY = '15aa'
const SWITCH = '15ba'
const STROKE = '15bb'
const TIMER_GET = '25ca'
const TIMER_SET = '35ca'
const MACADDR = '15ea'
const FWVER = '25ea'
const SERIALNUMBER = '35ea'

export default function(homebridge: any) {
  Accessory = homebridge.platformAccessory
  HMService = homebridge.hap.Service
  HMCharacteristic = homebridge.hap.Characteristic
  UUIDGen = homebridge.hap.uuid

  homebridge.registerAccessory("homebridge-switcher", "Switcher", SwitcherAccessory)
}

const connectToDevice = (serial: string): Promise<IODevice>  => {
  return new Promise((resolve, reject) => {
    noble.on('stateChange', (state) => {
      console.log('noble ' + state)
      if (state === 'poweredOn') {
        noble.startScanning([], false, (error) => {
          console.log('Error while starting scan operation: ' + error)
        })
      }
    })  
    noble.on('discover', (peri) => {
      console.log(peri)
      if (peri.advertisement.localName == 'SWITCHER_M') {
        peri.connect((error) => {
          if (error) reject('periConnect: ' + error)
          let chars
          fetchCharacteristics(peri)
            .then((_chars) => {
              console.log('Discovered SWITCHER_M')
              chars = _chars
              return readFromChar(chars.serial)
            })
            .then((serialBuf) => {
              console.log('Read serial Data')
              let serialParts = ''
              for (let i = 0; i < 8; i++)
              serialParts += serialBuf.readUInt8(i).toString(16).toUpperCase()
              console.log('S/N ' + serialParts)
              if (serialParts == serial) {
                noble.stopScanning()
                resolve(chars)
              }
            })
            .catch((error) => reject('discover: ' + error))
        })
      }
    })
  })
}

const fetchCharacteristics = (peripheral: _Peripheral): Promise<IODevice> => {
  return new Promise((resolve, reject) => {
    let battery, switchControl, firmware, serial, mac
    peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
      if (error) {
        reject('fetchChar: ' + error)
        return
      }
      for (const item of characteristics) {
        switch (item.uuid) {
          case BATTERY:
            battery = item
            break
          case SWITCH:
            switchControl = item
            break
          case FWVER:
            firmware = item
            break
          case SERIALNUMBER:
            serial = item
            break
          case MACADDR:
            mac = item
            break
        }
      }
      if (!(battery && switchControl && firmware && serial && mac)) reject()
      else resolve(new IODevice(peripheral, battery, switchControl, firmware, serial, mac))
    })
  })
}

const writeToChar = async (characteristic: _Characteristic, data: Buffer): Promise<void> => {
  return new Promise((resolve, reject) => {
    characteristic.write(data, true, (error) => {
      if (error) reject('writeToChar: ' + error)
      else resolve()
    })
  })
}

const readFromChar = async (characteristic: _Characteristic): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    characteristic.read((error, data) => {
      if (error) reject('readFromChar: ' +error)
      else resolve(data)
    })
  })
}

class IODevice {
  peripheral: _Peripheral
  battery: _Characteristic
  switchControl: _Characteristic
  firmware: _Characteristic
  serial: _Characteristic
  mac: _Characteristic

  constructor(peripheral, battery, switchControl, firmware, serial, mac) {
    this.peripheral = peripheral
    this.battery = battery
    this.switchControl = switchControl
    this.firmware = firmware
    this.serial = serial
    this.mac = mac
  }
}

class SwitcherAccessory {
  log: Function
  name: string
  serialNo: string
  buttonType: string

  firmwareVer: string
  macAddr: string
  batteryLevel: number

  peripheral: _Peripheral | null
  characteristics: IODevice | null

  informationService: any
  firstSwitchService: any
  secondSwitchService: any
  batteryService: any

  firstStatus: boolean
  secondStatus: boolean

  constructor(log, config) {
    this.log = log
    this.name = config['name']
    this.serialNo = config['serial']
    this.buttonType = config['buttonType']

    this.peripheral = null
    this.characteristics = null
    this.firstStatus = false
    this.secondStatus = false
    this.macAddr = ''
    this.firmwareVer = ''
    this.batteryLevel = 0

    this.informationService = new HMService.AccessoryInformation()

    this.informationService
      .getCharacteristic(HMCharacteristic.Identify)
      .on("set", callbackify(async (): Promise<boolean> => { return true }))
    this.informationService
      .getCharacteristic(HMCharacteristic.Manufacturer)
      .on('get', callbackify(async (): Promise<string> => { return 'I/O' }))
    this.informationService
      .getCharacteristic(HMCharacteristic.Name)
      .on('get', callbackify(async (): Promise<string> => { return 'Switcher Information' }))
    this.informationService
      .getCharacteristic(HMCharacteristic.Model)
      .on('get', callbackify(async (): Promise<string> => { return 'Switcher ' + this.buttonType }))
    this.informationService
      .getCharacteristic(HMCharacteristic.SerialNumber)
      .on('get', callbackify(async (): Promise<string> => { return this.serialNo }))
    this.informationService
      .getCharacteristic(HMCharacteristic.FirmwareRevision)
      .on('get', callbackify(async (): Promise<string> => { return this.firmwareVer }))

    this.firstSwitchService = new HMService.Lightbulb(
      this.name + ' first',
      'first switch'
    )

    this.firstSwitchService
      .getCharacteristic(HMCharacteristic.On)
      .on('get', callbackify(this.checkFirstStatus))
      .on('set', callbackify(this.firstOn))

    this.secondSwitchService = new HMService.Lightbulb(
      this.name + ' second',
      'second switch'
    )

    this.secondSwitchService
      .getCharacteristic(HMCharacteristic.On)
      .on('get', callbackify(this.checkSecondStatus))
      .on('set', callbackify(this.secondOn))

    this.batteryService = new HMService.BatteryService(
      this.name + ' battery',
      'battery'
    )
    this.batteryService
      .getCharacteristic(HMCharacteristic.BatteryLevel)
      .on('get', callbackify(this.getBattery))
    this.batteryService
      .getCharacteristic(HMCharacteristic.ChargingState)
      .on('get', callbackify(async (): Promise<number> => { return 1 }))
    this.batteryService
      .getCharacteristic(HMCharacteristic.StatusLowBattery)
      .on('get', callbackify(this.checkLowBattery))


    connectToDevice(this.serialNo)
    .then(((characteristics: IODevice) => {
      this.peripheral = characteristics.peripheral
      this.characteristics = characteristics
      return readFromChar(characteristics.firmware)
    }).bind(this))
    .then(((firmwareVer) => {
      this.firmwareVer = `v${firmwareVer.readUInt8(0)}.${firmwareVer.readUInt8(1)}.${firmwareVer.readUInt8(2)}`
      log('F/W Ver ' + this.firmwareVer)
      return readFromChar(this.characteristics!!.mac)
    }).bind(this))
    .then(((macAddr) => {
      let macPart: Array<string> = []
      for (let i = 0; i < 6; i++) {
        let s: string = macAddr.readUInt8(i).toString(16).toUpperCase()
        while (s.length < 2) {
          s = '0' + s
        }
        macPart.push(s)
      }
      log('MAC Address ' + macPart.join(':'))
      this.macAddr = macPart.join(':')
      log('Switcher initialized')
    }).bind(this)).catch((error) => {
      log('Error while activating BLE: ' + error)
    })
  }

  getServices() {
    let services = [
      this.informationService,
      this.firstSwitchService,
      this.batteryService
    ]
    if (this.buttonType == 'two') {
      services.push(this.secondSwitchService)
    }
    return services
  }

  checkFirstStatus = async (): Promise<boolean> => {
    return this.firstStatus
  }

  checkSecondStatus = async (): Promise<boolean> => {
    return this.secondStatus
  }

  getBattery = async (): Promise<number> => {
    if (!this.peripheral || !this.characteristics) return 0
    const battery = await readFromChar(this.characteristics.battery)
    return battery.readUInt8(0)
  }

  checkLowBattery = async () => {
    const battery = await this.getBattery()
    this.batteryLevel = battery
    return battery >= 10 ? 0 : 1
  }

  writeSwitch = async (byte)  => {
    if (!this.peripheral || !this.characteristics) return
    const buffer = new Buffer(1)
    buffer.writeUInt8(byte, 0)
    await writeToChar(this.characteristics.switchControl, buffer)
    this.log('Written 0x' + byte)
  }

  firstOn = async (on) => {
    const byteToWrite = on ? 0x00 : 0x01
    await this.writeSwitch(byteToWrite)
    this.firstStatus = on
  }

  secondOn = async (on) => {
    const byteToWrite = on ? 0x02 : 0x03
    await this.writeSwitch(byteToWrite)
    this.firstStatus = on
  }

}