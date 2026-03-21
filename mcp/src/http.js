// src/http.js — minimal https helpers (no axios dependency)

const https = require('https')

function postJson(host, path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body))
    const req  = https.request(
      {
        hostname: host,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      },
      res => {
        let raw = ''
        res.on('data', c => { raw += c })
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) }
          catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 300))) }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 300))) }
      })
    }).on('error', reject)
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

module.exports = { postJson, getJson, sleep }
