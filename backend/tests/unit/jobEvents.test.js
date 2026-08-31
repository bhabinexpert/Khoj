'use strict';

const { publishJobsChanged, onJobsChanged, lastIngestAt, subscriberCount, _reset } = require('../../src/services/jobEvents');

describe('jobEvents', () => {
  beforeEach(_reset);
  afterAll(_reset);

  it('delivers an ingest summary to every subscriber', () => {
    const first = jest.fn();
    const second = jest.fn();
    onJobsChanged(first);
    onJobsChanged(second);

    const event = publishJobsChanged({ inserted: 3, updated: 1, merged: 0 });

    expect(event).toMatchObject({ type: 'jobs:changed', inserted: 3, updated: 1, merged: 0 });
    expect(typeof event.at).toBe('string');
    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
  });

  it('stays quiet when an ingest changed nothing', () => {
    const listener = jest.fn();
    onJobsChanged(listener);

    // What the scraper does most of the time: re-sees the same postings and only
    // re-stamps `lastSeenAt`. Waking every open browser for that is noise.
    expect(publishJobsChanged({ inserted: 0, updated: 0, merged: 0, skipped: 42 })).toBeNull();
    expect(publishJobsChanged({})).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(lastIngestAt()).toBeNull();
  });

  it('publishes when only a merge happened', () => {
    const listener = jest.fn();
    onJobsChanged(listener);
    expect(publishJobsChanged({ merged: 1 })).not.toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('coerces missing and non-numeric counts to zero rather than emitting NaN', () => {
    const event = publishJobsChanged({ inserted: '2', updated: undefined, merged: 'lots' });
    expect(event).toMatchObject({ inserted: 2, updated: 0, merged: 0 });
  });

  it('remembers when the last real change landed', () => {
    expect(lastIngestAt()).toBeNull();
    const event = publishJobsChanged({ inserted: 1 });
    expect(lastIngestAt()).toBe(event.at);

    // A no-op ingest must not move the clock forward.
    publishJobsChanged({ inserted: 0, updated: 0, merged: 0 });
    expect(lastIngestAt()).toBe(event.at);
  });

  it('unsubscribes exactly one listener, so a closed stream stops being written to', () => {
    const listener = jest.fn();
    const other = jest.fn();
    const off = onJobsChanged(listener);
    onJobsChanged(other);
    expect(subscriberCount()).toBe(2);

    off();

    expect(subscriberCount()).toBe(1);
    publishJobsChanged({ inserted: 1 });
    expect(listener).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });
});
