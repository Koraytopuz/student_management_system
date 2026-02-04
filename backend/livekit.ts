// backend/src/livekit.ts
import { AccessToken } from 'livekit-server-sdk';

const livekitUrl = process.env.LIVEKIT_URL!;
const livekitApiKey = process.env.LIVEKIT_API_KEY!;
const livekitApiSecret = process.env.LIVEKIT_API_SECRET!;

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