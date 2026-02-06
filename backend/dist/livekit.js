"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRoomName = buildRoomName;
exports.createLiveKitToken = createLiveKitToken;
exports.getLiveKitUrl = getLiveKitUrl;
const livekit_server_sdk_1 = require("livekit-server-sdk");
// Not: Bu örnek projede basitlik için LiveKit
// yapılandırmasını doğrudan kod içine yazıyoruz.
// Üretim ortamında bunları .env üzerinden okumak gerekir.
const livekitUrl = 'wss://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiKey = 'APIJiNyCodMYzVC';
const livekitApiSecret = 'zOd5eaXndMOGgjNkHpHNaqyhxTiIxQSSEUIdJWU32sa';
function buildRoomName(meetingId) {
    return `meeting-${meetingId}`;
}
function createLiveKitToken(params) {
    const at = new livekit_server_sdk_1.AccessToken(livekitApiKey, livekitApiSecret, {
        identity: params.identity,
        name: params.name,
    });
    at.addGrant({
        room: params.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    return at.toJwt();
}
function getLiveKitUrl() {
    return livekitUrl;
}
//# sourceMappingURL=livekit.js.map