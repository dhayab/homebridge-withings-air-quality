# homebridge-withings-air-quality

This plugin retrieves carbon dioxide and temperature levels from a Withings Smart Body Analyzer smart scale and exposes them as Homekit sensors with [Homebridge](https://github.com/nfarina/homebridge).

## Installation

The plugin can be installed using the command line

```bash
$ npm install -g homebridge-withings-air-quality
```

or by searching **homebridge-withings-air-quality** in the Plugins page of a [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x) dashboard.

## Configuration

The Withings Smart Body Analyzer cannot be accessed directly, so the plugin will require [my.withings.com](https://my.withings.com) email address and password in order to fetch the air quality data online.

The plugin also requires the MAC address of the smart scale. It can be found where the batteries are located.

Here is a sample config (you can view [config.sample.json](./config.sample.json) for more details):

```json
{
  "accessories": [
    {
      "accessory": "Withings Air Quality",
      "name": "Bathroom scale",
      "email": "my.withings@email.com",
      "password": "myWithingsPassword",
      "mac": "0ab2c3d4e5f6", // Do not add separators
      "coThreshold": 1000 // Optional
    }
  ]
}
```

The `coThreshold` parameter is used to trigger an "abnormal level" alert on the carbon dioxide sensor in Homekit. The value is measured in ppm (parts per million). For more information, [check out this page](https://support.withings.com/hc/en-us/articles/201489797-Smart-Body-Analyzer-WS-50-Frequently-asked-questions-about-air-quality-measurements).
