import { settlementPresentation } from './settlement-presentation.js';
import { GOODS, RULES, offerGood, } from "../../shared/src/index.js";
const eventNames = {
    "market-deerskin": "鹿皮商情", "market-sugar": "蔗糖商情", "market-rice": "稻米商情", "market-sulfur": "硫磺商情", "extra-stock": "藩庫徵調", "dutch": "荷蘭商館競購", "reef": "澎湖暗礁", "navy-sulfur": "水師徵用令（硫磺）", "navy-rice": "水師徵用令（稻米）",
    "sugar-harvest": "蔗糖豐收",
    "rice-shortage": "稻米短缺",
    "deerskin-demand": "鹿皮需求",
    "sulfur-demand": "硫磺需求",
    surplus: "貨物過剩",
    merchants: "商賈雲集",
    typhoon: "颱風來襲",
    tailwind: "順風順水",
    inspection: "海防嚴查",
    bribery: "疏通關節",
    prosperity: "商路興盛",
    abundance: "貨源充裕",
};
const goodName = {
    rice: "稻米",
    deerskin: "鹿皮",
    sulfur: "硫磺",
    sugar: "蔗糖",
};
const cargoName = {
    safe: "安全返航",
    cloth: "布匹",
    porcelain: "瓷器",
    weapons: "軍武",
};
const stateName = {
    sailing: "航行中",
    arrived: "入港",
    failed: "停泊",
    unassigned: "待派船",
    "awaiting-pirates": "第 13 格，等待海盜",
};
const reasons = {
    initial: "起始資金",
    auction: "船長標金",
    stock: "認購股票",
    placement: "占位費",
    insurance: "保險收入",
    pledge: "抵押",
    redeem: "贖回股票",
    dividend: "去程分紅",
    port: "港口獎金",
    dock: "停泊獎金",
    reimbursement: "保險償付",
    camp: "緝私下注",
    "camp-prize": "緝私獎金",
    return: "回程分紅",
    ransom: "贖人",
    "commission": "皇商牌照", "flag-pension": "軍功撫恤", "flag-award": "令旗賞銀", "camp-refund": "緝私退費",
    "final-ransom": "終局拘押扣款",
};
const effects = {
    firstSailModifier: "首輪航行修正",
    portBonus: "港口獎金加成",
    dockBonus: "停泊獎金加成",
    insuranceIncome: "保險初始收入",
    ransom: "一般贖金",
    stableReturnAdjustment: "穩定回程獎金修正",
};
export function publicStep(before, after, a, system) {
    const lines = [];
    const ship = (id) => "船 " + id.split("-").at(-1);
    const token = (id) => {
        const owner = before.players.find((p) => p.crew.some((c) => c.id === id));
        return (owner?.id ?? "") + " 的 " + id.split("-").at(-1) + " 號棋";
    };
    const entries = after.ledger.slice(before.ledger.length);
    if (a.type === "StartSeason")
        lines.push(["", "海禁與軍需", "反攻閩南", "海疆危局"][after.act] +
            " · 第 " +
            after.season +
            " 季，準備翻開事件卡");
    if (a.type === "RevealEvent") {
        lines.push("本季事件 " +
            (after.eventRevealed ? eventNames[after.eventRevealed] : "尚未揭示"));
        for (const k of Object.keys(effects))
            if (after.effects[k] !== before.effects[k])
                lines.push(effects[k] + "：" + before.effects[k] + " → " + after.effects[k]);
    }
    if (a.type === "RevealEvent" && after.eventRevealed) {
        const card = after.eventRevealed;
        if (after.weather)
            lines.push("本季天氣：" + ({ normal: "正常", typhoon: "颱風", tailwind: "順風" }[after.weather]));
        if (card.startsWith('market-'))
            lines.push('指定商品成功入港才擲兩骰：2～5 整船 −6，6～7 不變，8～12 整船 +18。');
        if (card.startsWith('navy-'))
            lines.push('指定商品第三輪骰後前進額外 2 格，入港去程獎金 −8。');
        if (card === 'reef')
            lines.push('骰後恰停第 8 格立即失敗；跨越或領航不觸發。');
        if (card === 'extra-stock')
            lines.push('本季船長可認購至多兩張不同商品股票。');
        if (card === 'dutch')
            lines.push('首艘入港商品股價額外 +5。');
        const printedNames = {
            "rice-shortage": "福建缺糧",
            "deerskin-demand": "鹿皮商需",
            "sulfur-demand": "硫磺採購",
            surplus: "商貨積壓",
            inspection: "沿海盤查",
            bribery: "暗中疏通",
        };
        if (after.ruleVersion !== "1.5" && printedNames[card])
            lines.push("V1.3 卡名：" + printedNames[card]);
        const marketRules = {
            "sugar-harvest": "蔗糖價差下調",
            "rice-shortage": "稻米價差上調",
            "deerskin-demand": "鹿皮價差上調",
            "sulfur-demand": "硫磺價差上調",
            surplus: "最高價差商品全數下調",
            merchants: "最低價差商品全數上調",
        };
        if (marketRules[card]) {
            lines.push("翻牌立即生效：" +
                marketRules[card] +
                RULES.spreadStep +
                " 銀，下限 " +
                RULES.spreadFloor +
                "；新價差沿用至下次市場變動。");
            for (const g of GOODS)
                if (before.commodities[g].spread !== after.commodities[g].spread)
                    lines.push(goodName[g] +
                        "價差 " +
                        before.commodities[g].spread +
                        " → " +
                        after.commodities[g].spread);
        }
        else {
            lines.push("有效至本季結束。");
            if (card === "typhoon" || card === "tailwind")
                lines.push("航行修正只套用第一次擲骰；下注加成於對應席位給付時生效。");
            if (card === "inspection" || card === "bribery")
                lines.push("適用於本季一般拘押的自願贖回。");
            if (card === "prosperity" || card === "abundance")
                for (const g of ["cloth", "porcelain"]) {
                    const base = RULES.returnTerms[g][3];
                    lines.push("第二幕回程 · " +
                        cargoName[g] +
                        "整船 " +
                        base +
                        " → " +
                        (base + after.effects.stableReturnAdjustment) +
                        " 銀");
                }
        }
    }
    if (a.type === "BidPublic")
        lines.push("公開喊價 " + a.amount + " 銀");
    if (a.type === "WithdrawPublic")
        lines.push("PASS，退出本季競標");
    if (a.type === "SubmitSealedBid")
        lines.push("已提交秘密標金");
    if (after.captainId && !before.captainId) {
        if (after.auction?.kind === "sealed")
            lines.push("揭標：" +
                after.auction.sealedBids
                    .map((b) => b.actorId + " " + b.amount + " 銀")
                    .join("、"));
        const payment = entries.find((e) => e.reason === "auction" && e.playerId === after.captainId);
        if (payment)
            lines.unshift("本季船長 " + after.captainId + " 得標，實付 " + -payment.delta + " 銀");
        lines.push("船長 " + after.captainId + " 得標");
    }
    if (a.type === "BuyStockOrSkip")
        lines.push(a.stockId ? "認購 " + goodName[offerGood(a.stockId)] : "放棄本季認購");
    if (a.type === "AssignShips")
        lines.push(...a.assignments.map((s) => ship(s.shipId) +
            " · " +
            goodName[s.good] +
            " 自第 " +
            s.start +
            " 格出發"));
    if (a.type === "PlaceCrewOrPass")
        lines.push(a.placement
            ? token(a.placement.crewId) + " → " + a.placement.positionId
            : "放棄本輪配置");
    if (a.type === "PirateBoardOrDecline" ||
        a.type === "PirateTakeoverDecision") {
        lines.push(ship(a.shipId) +
            " · " +
            (a.type === "PirateBoardOrDecline"
                ? a.crewId
                    ? "第二輪登船"
                    : "等待第三輪"
                : a.join !== undefined ? a.join ? "第二海盜加入空席，沿用第一海盜入港決定" : "第二海盜放棄加入" : after.pendingSpecial?.takeover ? "第一海盜劫持，等待第二海盜決定是否加入" : a.enterPort === null
                    ? "放棄劫持"
                    : a.enterPort
                        ? "第三輪整船劫持，入港"
                        : "第三輪整船劫持，轉入停泊"));
        const members = (s) => s.positions
            .filter((p) => p.shipId === a.shipId && p.crewId)
            .map((p) => p.crewId);
        lines.push("原船員：" + (members(before).map(token).join("、") || "空船"));
        for (const id of members(before).filter((id) => !members(after).includes(id)))
            lines.push(token(id) +
                " 被移離，退回玩家；原席費不退（原席 " +
                before.positions.find((p) => p.crewId === id).seat +
                "）");
        lines.push("目前船員：" + (members(after).map(token).join("、") || "空船"));
    }
    if (a.type === "Sail" || a.type === "ApplyPilotMoves") {
        lines.push("當季船長 " + before.captainId);
        for (const s of after.ships) {
            const old = before.ships.find((b) => b.id === s.id);
            if (s.dice.length === old.dice.length &&
                s.position === old.position &&
                s.status === old.status)
                continue;
            lines.push(ship(s.id) +
                " " +
                (s.dice.length > old.dice.length
                    ? "擲 " +
                        s.dice.at(-1) +
                        " 點" +
                        (before.phase === "SAIL_1"
                            ? "（天氣修正 " + before.effects.firstSailModifier + "）"
                            : "")
                    : "領航") +
                "：" +
                old.position +
                " → " +
                s.position +
                " 格 · " +
                stateName[s.status]);
        }
    }
    if (a.type === 'PlaceCrewOrPass' && a.placement) {
        const player = before.players.find(p => p.id === a.actorId);
        if (before.act === 2 && player.flags && player.placements === 2) {
            const seat = before.positions.find(p => p.id === a.placement.positionId);
            lines.push('水師令旗發動 · ' + seat.id + ' 標示 ' + seat.cost + '，實付 0，節省 ' + seat.cost + ' 銀');
        }
    }
    if (a.type === "SettleOutbound") {
        if (after.ruleVersion === '1.5') {
            for (const e of after.events.slice(before.events.length))
                if (e.type === 'MarketResult' && e.detail)
                    lines.push(e.detail);
            for (const s of after.ships) {
                if (!s.good)
                    continue;
                lines.push(goodName[s.good] + ' ' + (s.status === 'arrived' ? '入港 +5' : '第 ' + after.commodities[s.good].consecutiveFailures + ' 次失敗 ' + (after.commodities[s.good].consecutiveFailures % 2 ? '−2' : '−3')) + ' · 股價 ' + before.commodities[s.good].stockPrice + ' → ' + after.commodities[s.good].stockPrice + ' 銀' + (s.pirateImpact ? '（含海盜 −5）' : ''));
            }
            if (after.act === 2)
                lines.push('官府包銷依入港順位：瓷器 18、布匹 12、第三船 0；空船占額。');
        }
        const n = after.ships.filter((s) => s.status === "arrived").length;
        lines.push(n + " 艘入港，" + (after.ships.length - n) + " 艘停泊");
        for (const s of after.ships)
            lines.push(ship(s.id) +
                " " +
                stateName[s.status] +
                "，整船去程分紅 " +
                entries
                    .filter((e) => e.shipId === s.id && e.reason === "dividend")
                    .reduce((n, e) => n + e.delta, 0) +
                " 銀");
        if (before.act !== 2)
            for (const p of after.players) {
                const boarded = before.positions
                    .filter((q) => q.shipId && p.crew.some((c) => c.id === q.crewId))
                    .map((q) => before.ships.find((s) => s.id === q.shipId).status);
                lines.push("緝私營 " +
                    p.id +
                    "：" +
                    (!boarded.includes("failed")
                        ? "沒有失敗船船員"
                        : before.ruleVersion === "1.5" ? "可將誤期船員轉職" : boarded.includes("arrived")
                            ? "同季另有船員入港"
                            : !p.crew.some((c) => c.status.kind === "available")
                                ? "沒有閒置手下"
                                : "符合資格"));
            }
    }
    if (a.type === "CampChoice")
        lines.push(a.crewIds.length
            ? "投入 " + a.crewIds.map(token).join("、")
            : "無人增派緝私營");
    if (a.type === "VoteReturnOption") {
        const old = before.returnVotes.find((v) => v.shipId === a.shipId), next = after.returnVotes.find((v) => v.shipId === a.shipId);
        lines.push(ship(a.shipId) +
            "，第 " +
            old.round +
            " 輪，" +
            token(a.crewId) +
            " 已投票（" +
            (old.ballots.length + 1) +
            "/" +
            old.electorate.length +
            "）");
        if (next.result || next.round !== old.round) {
            const votes = [...old.ballots, { crewId: a.crewId, option: a.option }];
            for (const member of old.electorate) {
                const ballot = votes.find((b) => b.crewId === member.crewId);
                lines.push(ship(a.shipId) +
                    "，第 " +
                    old.round +
                    " 輪：玩家 " +
                    member.ownerId +
                    "・棋子 " +
                    member.crewId.split("-").at(-1) +
                    " 投" +
                    cargoName[ballot.option]);
            }
            lines.push(old.options
                .map((o) => cargoName[o] +
                " " +
                votes.filter((b) => b.option === o).length +
                " 票")
                .join("、"));
            const counts = old.options.map((o) => votes.filter((b) => b.option === o).length);
            lines.push(next.round !== old.round
                ? "首輪平票，全船重新選擇"
                : (counts.filter((n) => n === Math.max(...counts)).length > 1
                    ? "再次平票，強制"
                    : "表決結果：") + cargoName[next.result]);
        }
    }
    if (a.type === "ResolveReturns") {
        for (const p of after.players) {
            const gain = (p.flags ?? 0) - (before.players.find(x => x.id === p.id)?.flags ?? 0);
            if (gain)
                lines.push(p.id + " 本季獲得 " + gain + " 枚令旗");
        }
        for (const v of before.returnVotes) {
            const opt = v.result;
            if (opt === "safe") {
                lines.push(ship(v.shipId) + " 安全返航");
                continue;
            }
            const die = after.rngLog
                .slice(before.rngLog.length)
                .find((r) => r.purpose === "return:" + v.shipId && r.result >= 0);
            const cut = RULES.returnTerms[opt][0];
            lines.push(ship(v.shipId) +
                " " +
                cargoName[opt] +
                " · " +
                (die
                    ? "成功門檻 " +
                        cut +
                        "，擲 " +
                        (die.result + 1) +
                        " 點：" +
                        (die.result + 1 >= cut
                            ? "成功"
                            : opt === "weapons" && die.result === 0
                                ? "大失敗"
                                : "失敗")
                    : "第二幕穩定貿易") +
                "，整船實收 " +
                entries
                    .filter((e) => e.shipId === v.shipId && e.reason === "return")
                    .reduce((s, e) => s + e.delta, 0) +
                " 銀");
        }
        for (const entry of entries.filter(e => e.reason === 'camp-prize' && e.shipId)) {
            const vote = before.returnVotes.find(v => v.shipId === entry.shipId);
            const own = vote.electorate.filter(member => member.ownerId === entry.playerId).length;
            lines.push(ship(entry.shipId) + ' · 緝私 ' + entry.playerId + ' · ' + cargoName[vote.result] + ' · 同船自己人 ' + own + ' 枚（每枚扣 4，最低 0） · 實領 ' + entry.delta + ' 銀');
        }
        if (before.campCrew.length && before.returnVotes.some(v => v.result !== 'safe') && !entries.some(e => e.reason === 'camp-prize'))
            lines.push('走私全部成功，緝私營無獎金');
        if (before.act !== 2)
            lines.push("緝私營占位：" +
                (before.campCrew.map(token).join("、") || "無人") +
                "；實收 " +
                entries
                    .filter((e) => e.reason === "camp-prize" || e.reason === "camp-refund")
                    .reduce((n, e) => n + e.delta, 0) +
                " 銀");
        lines.push("第一幕軍武成功 " +
            after.weaponsSuccesses +
            "/2" +
            (after.weaponsSuccesses >= 2 ? "，達延長條件" : ""));
    }
    if (a.type === "FinishRansom")
        lines.push("結束本季贖回，未贖棋子仍被拘押");
    for (const p of after.players)
        for (const c of p.crew) {
            const old = before.players
                .find((x) => x.id === p.id)
                .crew.find((x) => x.id === c.id);
            if (c.status.kind === "detained" && old.status.kind !== "detained")
                lines.push(token(c.id) +
                    " 被拘押，" +
                    (c.status.severe
                        ? "大失敗，不可提前贖回"
                        : "本季贖金 " + after.effects.ransom + " 銀"));
            if (old.status.kind === "detained" && c.status.kind === "available")
                lines.push(token(c.id) + " 已回到手中");
        }
    for (const g of GOODS)
        for (const k of ["stockPrice", "spread"])
            if (before.commodities[g][k] !== after.commodities[g][k])
                lines.push(goodName[g] +
                    (k === "spread" ? "價差" : "股價") +
                    "：" +
                    before.commodities[g][k] +
                    " → " +
                    after.commodities[g][k]);
    for (const e of entries)
        lines.push(e.playerId +
            " " +
            reasons[e.reason] +
            " " +
            (e.delta > 0 ? "+" : "") +
            e.delta +
            " 銀" +
            (e.shipId ? " · " + ship(e.shipId) : "") +
            (e.crewId ? " · " + token(e.crewId) : "") +
            "（餘 " +
            e.balance +
            "）");
    if (after.act !== before.act)
        lines.push("進入第 " + after.act + " 幕");
    if (a.type === 'EndSeason') {
        for (const p of after.players) {
            lines.push(p.id + ' · 現有令旗 ' + (p.flags ?? 0) + ' 枚');
        }
        if (after.finalWealth)
            for (const w of [...after.finalWealth].sort((a, b) => b.total - a.total))
                lines.push(w.playerId + ' 終局現銀 ' + w.cash + ' + 股票 ' + w.stocks + ' − 抵押 ' + w.mortgage + ' = ' + w.total + ' 銀');
    }
    if (a.type === "EndSeason")
        lines.push(after.finalWealth ? "本局結束" : "下一季：第 " + after.season + " 季");
    if (before.eventRevealed) {
        const source = eventNames[before.eventRevealed];
        const weatherSource = before.weather ? { normal: "正常", typhoon: "颱風", tailwind: "順風" }[before.weather] : source;
        if (a.type === "ResolveReturns" &&
            before.act === 2 &&
            before.effects.stableReturnAdjustment)
            for (const vote of before.returnVotes)
                if (vote.result && vote.result !== "safe") {
                    const base = RULES.returnTerms[vote.result][3];
                    lines.push(source +
                        " · " +
                        cargoName[vote.result] +
                        "整船 " +
                        base +
                        " → " +
                        (base + before.effects.stableReturnAdjustment) +
                        " 銀");
                }
        for (const e of entries) {
            if (e.reason === "ransom" && before.effects.ransom !== RULES.ransom)
                lines.push(source + " · 贖金 " + RULES.ransom + " → " + -e.delta + " 銀");
            if ((e.reason === "port" || e.reason === "dock") &&
                before.effects[e.reason === "port" ? "portBonus" : "dockBonus"]) {
                const seat = before.positions.find((p) => p.id === e.positionId);
                if (seat)
                    lines.push(weatherSource +
                        " · " +
                        reasons[e.reason] +
                        " " +
                        RULES.betPrizes[seat.seat - 1] +
                        " → " +
                        e.delta +
                        " 銀");
            }
            if (e.reason === "insurance" && e.delta !== RULES.insuranceIncome)
                lines.push(weatherSource +
                    " · 保險收入 " +
                    RULES.insuranceIncome +
                    " → " +
                    e.delta +
                    " 銀");
        }
    }
    if (before.act === 1 &&
        before.weaponsSuccesses < 2 &&
        after.weaponsSuccesses >= 2)
        lines.unshift("軍備支援達標 · 第 " +
            before.season +
            " 季，第一幕軍武走私累計 2/2。第三季季末確認軍備支援，第二幕增加一季；股票獨佔仍可提前終局。");
    if (!before.extendedSecondAct && after.extendedSecondAct)
        lines.unshift("季末確認軍備支援：第二幕第 4～6 季，第三幕第 7～8 季。");
    return {
        presentation: settlementPresentation(before, after, a),
        version: after.version,
        season: before.season,
        act: before.act,
        phase: before.phase,
        type: a.type,
        actor: system ? null : a.actorId,
        lines,
        confirm: a.type === "EndSeason" || a.type === "SettleOutbound" || a.type === "ResolveReturns",
    };
}
