import {describe, expect, it, vi} from 'vitest';
import {StatusNotifierRegistrationIndex} from '../../src/protocol/statusNotifierRegistration.js';

describe('StatusNotifier registration', () => {
    it('deduplicates one object registered through well-known and unique names', async () => {
        const registrations = new StatusNotifierRegistrationIndex();
        const resolveUniqueName = vi.fn((busName: string) => {
            expect(busName).toBe('org.kde.StatusNotifierItem-6318-1');
            return Promise.resolve(':1.113');
        });

        const results = await Promise.all([
            registrations.add('org.kde.StatusNotifierItem-6318-1', '', resolveUniqueName),
            registrations.add('/StatusNotifierItem', ':1.113', resolveUniqueName),
        ]);
        const emitted = results.filter(result => result !== null);

        expect(resolveUniqueName).toHaveBeenCalledOnce();
        expect(emitted).toEqual([{
            key: ':1.113/StatusNotifierItem',
            busName: ':1.113',
            objectPath: '/StatusNotifierItem',
        }]);
        expect(registrations.keys()).toEqual([':1.113/StatusNotifierItem']);
    });

    it('does not add a registration whose owner lookup completes after destruction', async () => {
        const registrations = new StatusNotifierRegistrationIndex();
        let resolveOwner: ((owner: string) => void) | undefined;
        const owner = new Promise<string>(resolve => { resolveOwner = resolve; });
        const pending = registrations.add('org.example.Indicator', '', () => owner);

        registrations.destroy();
        resolveOwner?.(':1.42');

        await expect(pending).resolves.toBeNull();
        expect(registrations.keys()).toEqual([]);
    });
});
