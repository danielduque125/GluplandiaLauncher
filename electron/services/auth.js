import path from 'node:path';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { atomicWrite, request, json } from './io.js';

// Endpoint corregido a 'consumers' para cuentas de Xbox/Minecraft (Evita el error AADSTS50059)
const TENANT = 'consumers';
const OAUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const DEFAULT_CLIENT_ID = '9e446a0c-f152-4334-8596-f63073971cf3';
const REDIRECT_URI = 'https://microsoftonline.com';
const SCOPES = 'XboxLive.signin offline_access';

export class MicrosoftAuth {
  constructor({ clientId = DEFAULT_CLIENT_ID, stateDir, secureStorage, openExternal, progress }) {
    Object.assign(this, {
      clientId: clientId || DEFAULT_CLIENT_ID,
      secureStorage,
      openExternal,
      progress
    });
    this.file = path.join(stateDir, 'microsoft-token.bin');
  }

  async save(token) {
    if (!token) return;
    if (!this.secureStorage.isEncryptionAvailable()) {
      throw new Error('Windows no permite guardar la sesión de forma cifrada.');
    }
    await atomicWrite(this.file, this.secureStorage.encryptString(token));
  }

  async load() {
    try {
      return this.secureStorage.decryptString(await fs.readFile(this.file));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      return null;
    }
  }

  async logout() {
    await fs.rm(this.file, { force: true });
  }

  async form(endpoint, fields, signal) {
    const response = await request(`${OAUTH_BASE}/${endpoint}`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        ...fields
      })
    });

    const body = await response.json();

    if (!response.ok) {
      const error = new Error(body.error_description || body.error || `Microsoft ${response.status}`);
      error.code = body.error;
      throw error;
    }

    return body;
  }

  /*
    Microsoft desktop authentication.

    The launcher keeps a public client id and uses the Xbox/Minecraft chain:
    Microsoft token -> Xbox Live -> XSTS -> Minecraft Services.

    offline_access is requested so refresh_token can be stored encrypted.
  */
  async login(signal) {
    const device = await this.form('devicecode', {
      scope: SCOPES
    }, signal);

    const verification = new URL(device.verification_uri);

    if (verification.protocol !== 'https:' ||
        !verification.hostname.endsWith('microsoft.com')) {
      throw new Error('Dirección Microsoft no válida.');
    }

    this.progress({
      phase: 'auth-code',
      code: device.user_code,
      message: `Introduce ${device.user_code} en Microsoft para continuar.`
    });

    await this.openExternal(verification.href);

    let interval = Math.max(device.interval || 5, 5) * 1000;
    const expires = Date.now() + (device.expires_in || 900) * 1000;

    while (Date.now() < expires) {
      await delay(interval, undefined, { signal });

      try {
        const token = await this.form('token', {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: device.device_code
        }, signal);

        if (token.refresh_token) {
          await this.save(token.refresh_token);
        }

        return this.minecraft(token.access_token, signal);

      } catch (error) {
        if (error.code === 'authorization_pending') continue;
        if (error.code === 'slow_down') {
          interval += 5000;
          continue;
        }
        throw error;
      }
    }

    throw new Error('El código de Microsoft expiró.');
  }

  async refresh(signal) {
    const refreshToken = await this.load();

    if (!refreshToken) {
      throw new Error('No existe sesión Microsoft guardada.');
    }

    const token = await this.form('token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES
    }, signal);

    if (token.refresh_token) {
      await this.save(token.refresh_token);
    }

    return this.minecraft(token.access_token, signal);
  }

  async minecraft(accessToken, signal) {
    const post = (url, body) => json(url, {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });

    const xbox = await post(
      'https://user.auth.xboxlive.com/user/authenticate',
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${accessToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      }
    );

    const xui = xbox.DisplayClaims?.xui?.[0];

    const xsts = await post(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xbox.Token]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      }
    );

    const claim = xsts.DisplayClaims?.xui?.[0];

    if (!claim?.uhs) {
      throw new Error('Xbox Live no devolvió identidad.');
    }

    const minecraft = await post(
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      {
        identityToken: `XBL3.0 x=${claim.uhs};${xsts.Token}`
      }
    );

    const headers = {
      Authorization: `Bearer ${minecraft.access_token}`
    };

    const entitlement = await json(
      'https://api.minecraftservices.com/entitlements/mcstore',
      { signal, headers }
    );

    if (!entitlement.items?.length) {
      throw new Error('La cuenta no tiene Minecraft Java.');
    }

    const profile = await json(
      'https://api.minecraftservices.com/minecraft/profile',
      { signal, headers }
    );

    return {
      mode: 'Microsoft',
      name: profile.name,
      uuid: profile.id,
      accessToken: minecraft.access_token,
      userType: 'msa'
    };
  }
}