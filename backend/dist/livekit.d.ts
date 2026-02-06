export declare function buildRoomName(meetingId: string): string;
export declare function createLiveKitToken(params: {
    roomName: string;
    identity: string;
    name?: string;
    isTeacher: boolean;
}): Promise<string>;
export declare function getLiveKitUrl(): string;
//# sourceMappingURL=livekit.d.ts.map