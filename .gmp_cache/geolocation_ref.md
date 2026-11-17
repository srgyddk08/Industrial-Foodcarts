# Geolocation API: Device Location via Cell Towers and Wi-Fi

## Overview

The Geolocation API is a web service that accepts an HTTPS `POST` request
containing cellular device data fields, cell tower locations, and Wi-Fi access
point arrays that a mobile client can detect. It returns latitude/longitude
coordinates and a radius indicating the accuracy of the result (in meters).

### When to Use This API

Use the Geolocation API to locate mobile or IoT devices that **do not** provide
native geolocation or GPS features.

> **Important Alternatives:** - **Browsers with HTML5 geolocation**: Use the
> Maps JavaScript API (`navigator.geolocation`) instead. - **Android Devices**:
> Use native location services such as `LocationManager` or the `Fused Location
> Provider API`. - **iOS Devices**: Use the native `Core Location` framework. -
> **Address / Coordinate / Place ID Conversion**: Use the
> [Geocoding API](https://developers.google.com/maps/documentation/geocoding/overview).

--------------------------------------------------------------------------------

## Endpoint and Authentication

All requests must be submitted via HTTPS `POST` to the following endpoint:

```text
https://www.googleapis.com/geolocation/v1/geolocate?key=YOUR_API_KEY
```

### Required Headers

-   `Content-Type: application/json`
-   `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1` (Required attribution
    header for REST requests)

--------------------------------------------------------------------------------

## Request Body Structure

The request body must be formatted as JSON. If the request body is empty (`{}`),
the API defaults to locating the device based on the request's IP address.

### Root Data Fields

Field                   | Type    | Description
:---------------------- | :------ | :----------
`homeMobileCountryCode` | integer | The mobile country code (MCC) for the device's home network.
`homeMobileNetworkCode` | integer | The mobile network code (MNC) for the device's home network.
`radioType`             | string  | The mobile radio type. Supported values include `lte`, `gsm`, `cdma`, `wcdma`, and `nr` (5G New Radio).
`carrier`               | string  | The carrier name (e.g., `"Vodafone"`).
`considerIp`            | boolean | Whether to fall back to IP geolocation if Wi-Fi and cell tower signals are not successful. Defaults to `true`. Set to `false` to disable IP fallback.
`cellTowers`            | array   | An array of cell tower objects.
`wifiAccessPoints`      | array   | An array of Wi-Fi access point objects (typically requires 2 or more MAC addresses for Wi-Fi triangulation).

### Cell Tower Object (`cellTowers`)

Field                       | Type    | Description
:-------------------------- | :------ | :----------
`cellId` / `newRadioCellId` | integer | Unique identifier of the cell (`cellId` for 2G/3G/4G; `newRadioCellId` for 5G NR).
`locationAreaCode`          | integer | The Location Area Code (LAC) for GSM/WCDMA networks or Tracking Area Code (TAC) for LTE.
`mobileCountryCode`         | integer | The cell tower's Mobile Country Code (MCC).
`mobileNetworkCode`         | integer | The cell tower's Mobile Network Code (MNC).
`age`                       | integer | The number of milliseconds since this cell was primary.
`signalStrength`            | number  | Radio signal strength measured in dBm.
`timingAdvance`             | number  | The timing advance value.

### Wi-Fi Access Point Object (`wifiAccessPoints`)

Field                | Type    | Description
:------------------- | :------ | :----------
`macAddress`         | string  | **Required.** The MAC address of the Wi-Fi node (e.g., `"00:25:9c:cf:1c:ac"`).
`signalStrength`     | integer | The current signal strength measured in dBm.
`age`                | integer | The number of milliseconds since this access point was detected.
`channel`            | integer | The channel over which the client is communicating with the access point.
`signalToNoiseRatio` | integer | The current signal to noise ratio measured in dB.

--------------------------------------------------------------------------------

## Code Examples

### 1. cURL Request (Cellular Data Only)

```bash
curl -X POST "https://www.googleapis.com/geolocation/v1/geolocate?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1" \
  -d '{
    "homeMobileCountryCode": 310,
    "homeMobileNetworkCode": 410,
    "radioType": "gsm",
    "carrier": "Vodafone",
    "considerIp": true
  }'
```

### 2. cURL Request (Cell Towers and Wi-Fi Access Points)

```bash
curl -X POST "https://www.googleapis.com/geolocation/v1/geolocate?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1" \
  -d '{
    "homeMobileCountryCode": 310,
    "homeMobileNetworkCode": 410,
    "radioType": "gsm",
    "carrier": "Vodafone",
    "considerIp": true,
    "cellTowers": [
      {
        "cellId": 42,
        "locationAreaCode": 415,
        "mobileCountryCode": 310,
        "mobileNetworkCode": 410,
        "age": 0,
        "signalStrength": -60,
        "timingAdvance": 15
      }
    ],
    "wifiAccessPoints": [
      {
        "macAddress": "00:25:9c:cf:1c:ac",
        "signalStrength": -43,
        "age": 0,
        "channel": 11,
        "signalToNoiseRatio": 0
      },
      {
        "macAddress": "00:25:9c:cf:1c:ad",
        "signalStrength": -55,
        "age": 0
      }
    ]
  }'
```

### 3. JavaScript / Node.js (`fetch`)

```javascript
async function geolocateDevice(apiKey) {
  const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`;

  const payload = {
    homeMobileCountryCode: 310,
    homeMobileNetworkCode: 410,
    radioType: "lte",
    carrier: "Vodafone",
    considerIp: true,
    wifiAccessPoints: [
      { macAddress: "00:25:9c:cf:1c:ac", signalStrength: -43 },
      { macAddress: "00:25:9c:cf:1c:ad", signalStrength: -55 }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Geolocation API Error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  console.log(`Location: ${data.location.lat}, ${data.location.lng}`);
  console.log(`Accuracy Radius: ${data.accuracy} meters`);
  return data;
}
```

--------------------------------------------------------------------------------

## Response Format

A successful geolocation request returns a JSON object containing `location`
coordinates and an `accuracy` radius in meters.

```json
{
  "location": {
    "lat": 37.421925,
    "lng": -122.0841293
  },
  "accuracy": 30.0
}
```

### Error Responses

If the request fails (e.g., invalid API key, daily limit exceeded, or
`considerIp: false` when no valid cell/Wi-Fi matches are found), the API returns
a standard Google JSON error response:

```json
{
  "error": {
    "errors": [
      {
        "domain": "global",
        "reason": "notFound",
        "message": "Not Found"
      }
    ],
    "code": 404,
    "message": "Not Found"
  }
}
```

--------------------------------------------------------------------------------

## Available Client Libraries

In addition to direct REST calls, you can invoke the Geolocation API using
community-supported server-side client libraries:

-   [Java Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-java)
-   [Python Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-python)
-   [Go Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-go)
-   [Node.js Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-js)
