"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRoomName = buildRoomName;
exports.createLiveKitToken = createLiveKitToken;
exports.getLiveKitUrl = getLiveKitUrl;
exports.hasParticipantsInRoom = hasParticipantsInRoom;
exports.muteAllParticipantsInRoom = muteAllParticipantsInRoom;
exports.unmuteAllParticipantsInRoom = unmuteAllParticipantsInRoom;
const livekit_server_sdk_1 = require("livekit-server-sdk");
// Not: Bu örnek projede basitlik için LiveKit
// yapılandırmasını doğrudan kod içine yazıyoruz.
// Üretim ortamında bunları .env üzerinden okumak gerekir.
const livekitUrl = 'wss://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiUrl = 'https://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiKey = 'APIJiNyCodMYzVC';
const livekitApiSecret = 'zOd5eaXndMOGgjNkHpHNaqyhxTiIxQSSEUIdJWU32sa';
const roomService = new livekit_server_sdk_1.RoomServiceClient(livekitApiUrl, livekitApiKey, livekitApiSecret);
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
/** Odada en az bir katılımcı (öğretmen) var mı kontrol et */
async function hasParticipantsInRoom(roomName) {
    try {
        const participants = await roomService.listParticipants(roomName);
        return participants.length > 0;
    }
    catch {
        return false;
    }
}
/** Tüm katılımcıların mikrofonlarını kapat (öğretmen için). TrackType.AUDIO = 0 */
async function muteAllParticipantsInRoom(roomName) {
    const participants = await roomService.listParticipants(roomName);
    let muted = 0;
    for (const p of participants) {
        for (const track of p.tracks) {
            if (track.type === 0) {
                await roomService.mutePublishedTrack(roomName, p.identity, track.sid, true);
                muted += 1;
            }
        }
    }
    return { muted };
}
/** Tüm katılımcıların mikrofonlarını aç (öğretmen için). TrackType.AUDIO = 0 */
async function unmuteAllParticipantsInRoom(roomName) {
    const participants = await roomService.listParticipants(roomName);
    let unmuted = 0;
    for (const p of participants) {
        for (const track of p.tracks) {
            if (track.type === 0) {
                await roomService.mutePublishedTrack(roomName, p.identity, track.sid, false);
                unmuted += 1;
            }
        }
    }
    return { unmuted };
}
//# sourceMappingURL=livekit.js.map