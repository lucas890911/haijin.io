export function submitVoteBatch(host, batch) {
    let submitted = 0;
    const stop = (reason) => ({ submitted, reason });
    if (!batch ||
        !Array.isArray(batch.votes) ||
        !batch.votes.length ||
        new Set(batch.votes.map((v) => v.crewId)).size !== batch.votes.length)
        return stop("選票清單無效");
    if (host.screen().observation.version !== batch.expectedVersion)
        return stop("對局已更新，請重新確認");
    const electorate = host.screen().observation.returnVotes.find((b) => b.shipId === batch.shipId)
        ?.electorate ?? [];
    const ordered = [...batch.votes].sort((a, b) => electorate.findIndex((c) => c.crewId === a.crewId) -
        electorate.findIndex((c) => c.crewId === b.crewId));
    for (const vote of ordered) {
        const screen = host.screen(), v = screen.observation;
        const ballot = v.returnVotes.find((b) => b.shipId === batch.shipId);
        if (screen.status !== "awaiting-human" ||
            v.selfId !== batch.actorId ||
            v.season !== batch.season ||
            v.phase !== "RETURN_VOTING" ||
            !ballot ||
            ballot.result ||
            ballot.round !== batch.round)
            return stop("投票階段、輪次或操作者已變更");
        const action = screen.legal.actions.find((a) => a.type === "VoteReturnOption" &&
            a.actorId === batch.actorId &&
            a.shipId === batch.shipId &&
            a.crewId === vote.crewId &&
            a.option === vote.option);
        if (!action)
            return stop("選票已提交或不再合法，請檢查剩餘選票");
        const result = host.submit(action);
        if (!result.ok)
            return stop(result.reason);
        submitted++;
    }
    return { submitted, reason: "" };
}
