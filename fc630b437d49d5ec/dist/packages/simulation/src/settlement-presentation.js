import { RULES } from '../../shared/src/index.js';
export function settlementPresentation(before, after, action) {
    const entries = after.ledger.slice(before.ledger.length);
    const rolls = after.rngLog.slice(before.rngLog.length).filter(r => r.result >= 0);
    const order = [...new Set(rolls.map(r => r.purpose.split(':').at(-1)))];
    const dice = order.flatMap(id => {
        const ship = before.ships.find(s => s.id === id);
        if (!ship)
            return [];
        const voyage = rolls.filter(r => r.purpose.endsWith(':' + ship.id));
        if (!voyage.length)
            return [];
        const values = voyage.map(r => r.result + 1);
        const next = after.ships.find(s => s.id === ship.id);
        const vote = before.returnVotes.find(v => v.shipId === ship.id);
        const option = vote?.result;
        const sum = values.reduce((a, b) => a + b, 0);
        let result = '';
        if (action.type === 'Sail') {
            const movement = next.position - ship.position;
            const adjustment = movement - values[0];
            result = (adjustment ? (before.phase === 'SAIL_3' ? '水師徵用令' : '天氣') + ' ' + (adjustment > 0 ? '+' : '') + adjustment + ' · ' : '') + '前進 ' + movement + ' 格（' + ship.position + ' → ' + next.position + '）';
        }
        else if (action.type === 'SettleOutbound') {
            result = after.events.slice(before.events.length).find(e => e.type === 'MarketResult' && e.detail?.startsWith(ship.id + ' '))?.detail ?? '';
        }
        else if (option && option !== 'safe') {
            const threshold = RULES.returnTerms[option][0];
            result = ({ cloth: '布匹', porcelain: '瓷器', weapons: '軍武' }[option]) + ' · ' + threshold + ' 點以上成功 · ' + (sum >= threshold ? '成功' : option === 'weapons' && sum === 1 ? '大失敗，重押' : '失敗，拘押');
        }
        return [{ shipId: ship.id, values, result }];
    });
    const flows = entries.map(e => {
        const placed = e.reason === 'dividend' ? before.ledger.filter(l => l.season === e.season && l.reason === 'placement' && l.crewId === e.crewId).at(-1) : undefined;
        const category = e.reason === 'dividend' && placed?.positionId?.startsWith('pirate-') ? 'pirate-dividend' : e.reason;
        return { id: e.id, playerId: e.playerId, delta: e.delta, balance: e.balance, category, incomeClass: category === 'pirate-dividend' ? 'pirate' : category === 'dividend' ? 'crew' : undefined, shipId: e.shipId, positionId: e.positionId, crewId: e.crewId };
    });
    return { dice, flows };
}
