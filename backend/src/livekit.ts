import { AccessToken } from 'livekit-server-sdk';

// Not: Bu örnek projede basitlik için LiveKit
// yapılandırmasını doğrudan kod içine yazıyoruz.
// Üretim ortamında bunları .env üzerinden okumak gerekir.

const livekitUrl = 'wss://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiKey = 'APIJiNyCodMYzVC';
const livekitApiSecret = 'zOd5eaXndMOGgjNkHpHNaqyhxTiIxQSSEUIdJWU32sa';

export function buildRoomName(meetingId: string) {
  return `meeting-${meetingId}`;
}

export function createLiveKitToken(params: {
  roomName: string;
  identity: string;
  name?: string;
  isTeacher: boolean;
}) {
  const at = new AccessToken(livekitApiKey, livekitApiSecret, {
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

export function getLiveKitUrl() {
  return livekitUrl;
}




