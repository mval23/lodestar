import { profileChanges, ProfileSchema } from './ProfileForm';
import type { Profile } from '../../lib/profile';

const profile: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  display_name: 'Sam',
  currency: 'USD',
  timezone: 'America/Bogota',
  week_start: 1,
  created_at: '2026-09-19T00:00:00Z',
  updated_at: '2026-09-19T00:00:00Z',
};

const values = (over: object = {}) =>
  ProfileSchema.parse({ display_name: 'Sam', currency: 'USD', timezone: 'America/Bogota', week_start: '1', ...over });

describe('profileChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(profileChanges(profile, values(), false)).toEqual({});
  });

  it('sends only the changed columns', () => {
    expect(profileChanges(profile, values({ timezone: 'UTC', week_start: '7' }), false)).toEqual({
      timezone: 'UTC',
      week_start: 7,
    });
  });

  it('turns an empty name into null', () => {
    expect(profileChanges(profile, values({ display_name: '  ' }), false)).toEqual({ display_name: null });
  });

  it('changes currency only while unlocked', () => {
    expect(profileChanges(profile, values({ currency: 'COP' }), false)).toEqual({ currency: 'COP' });
    expect(profileChanges(profile, values({ currency: 'COP' }), true)).toEqual({});
  });

  it('accepts a missing currency (disabled field)', () => {
    expect(profileChanges(profile, values({ currency: undefined }), true)).toEqual({});
  });
});
