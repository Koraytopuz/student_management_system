export declare function buildRoomName(meetingId: string): string;
export declare function createLiveKitToken(params: {
    roomName: string;
    identity: string;
    name?: string;
    isTeacher: boolean;
}): Promise<string>;
export declare function getLiveKitUrl(): string;
/** Tüm katılımcıların mikrofonlarını kapat (öğretmen için). TrackType.AUDIO = 0 */
export declare function muteAllParticipantsInRoom(roomName: string): Promise<{
    muted: number;
}>;
//# sourceMappingURL=livekit.d.ts.map