# Microsoft Authentication update

Configured:
- Client ID: 45a69c24-1179-4283-a155-ac39922e967a
- Redirect URI metadata: https://microsoftonline.com
- Scopes: XboxLive.signin offline_access

The launcher stores refresh tokens encrypted through Electron safeStorage and uses the Microsoft -> Xbox Live -> XSTS -> Minecraft Services chain.

Note: Microsoft desktop authentication requirements are controlled by Microsoft's identity platform and Minecraft services. If Microsoft rejects a client registration or requires additional configuration, that must be handled in the Microsoft application registration settings.


## 1.3.2 tenant correction
OAuth Microsoft changed from a consumers tenant endpoint to the public common endpoint. No private directory identifiers are used by the OAuth requests.
