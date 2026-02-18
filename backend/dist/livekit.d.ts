export declare function buildRoomName(meetingId: string): string;
export declare function createLiveKitToken(params: {
    roomName: string;
    identity: string;
    name?: string;
    isTeacher: boolean;
}): Promise<string>;
export declare function getLiveKitUrl(): string;
/** Odada en az bir katılımcı (öğretmen) var mı kontrol et */
export declare function hasParticipantsInRoom(roomName: string): Promise<boolean>;
/** Tüm katılımcıların mikrofonlarını kapat (öğretmen için). TrackType.AUDIO = 0 */
export declare function muteAllParticipantsInRoom(roomName: string): Promise<{
    muted: number;
}>;
/** Tüm katılımcıların mikrofonlarını aç (öğretmen için). TrackType.AUDIO = 0 */
export declare function unmuteAllParticipantsInRoom(roomName: string): Promise<{
    unmuted: number;
}>;
//# sourceMappingURL=livekit.d.ts.map