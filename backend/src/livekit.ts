import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

// Not: Bu örnek projede basitlik için LiveKit
// yapılandırmasını doğrudan kod içine yazıyoruz.
// Üretim ortamında bunları .env üzerinden okumak gerekir.

const livekitUrl = 'wss://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiUrl = 'https://studentmanagementsystem-lxfvpk7h.livekit.cloud';
const livekitApiKey = 'APIJiNyCodMYzVC';
const livekitApiSecret = 'zOd5eaXndMOGgjNkHpHNaqyhxTiIxQSSEUIdJWU32sa';

const roomService = new RoomServiceClient(livekitApiUrl, livekitApiKey, livekitApiSecret);

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

/** Odada en az bir katılımcı (öğretmen) var mı kontrol et */
export async function hasParticipantsInRoom(roomName: string): Promise<boolean> {
  try {
    const participants = await roomService.listParticipants(roomName);
    return participants.length > 0;
  } catch {
    return false;
  }
}

/** Tüm katılımcıların mikrofonlarını kapat (öğretmen için). TrackType.AUDIO = 0 */
export async function muteAllParticipantsInRoom(roomName: string): Promise<{ muted: number }> {
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
export async function unmuteAllParticipantsInRoom(roomName: string): Promise<{ unmuted: number }> {
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


