import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinecraftReadyLog } from '../electron/services/game.js';

test('no confunde la creación de java.exe con Minecraft listo', () => {
  assert.equal(isMinecraftReadyLog('[main/INFO]: Loading Minecraft 26.2 with Fabric Loader'), false);
  assert.equal(isMinecraftReadyLog('[Render thread/INFO]: Backend library: LWJGL version 3.x'), false);
});

test('reconoce hitos tardíos del cliente como fallback de ventana', () => {
  assert.equal(isMinecraftReadyLog('[Render thread/INFO]: OpenAL initialized on device Speakers'), true);
  assert.equal(isMinecraftReadyLog('[Render thread/INFO]: Sound engine started'), true);
  assert.equal(isMinecraftReadyLog('[Render thread/INFO]: Created: 1024x512x4 minecraft:textures/atlas/blocks.png-atlas'), true);
  assert.equal(isMinecraftReadyLog('[Render thread/INFO]: Connecting to play.gluplandia.com, 25565'), true);
});
