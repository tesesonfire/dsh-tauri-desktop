import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  decide,
  formatLogLine,
  normalizeSettings,
  type NotificationSettings,
} from "../src/notification";

const settings: NotificationSettings = { ...DEFAULT_SETTINGS };

describe("normalizeSettings", () => {
  it("returns defaults for null / garbage", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("not-json")).toEqual(DEFAULT_SETTINGS);
  });

  it("parses stored json and keeps defaults for missing keys", () => {
    const parsed = normalizeSettings('{"notifyOnReady":"false","notifyOnStop":true}');
    expect(parsed.notifyOnReady).toBe(false);
    expect(parsed.notifyOnStop).toBe(true);
    expect(parsed.notifyOnCrash).toBe(true);
  });

  it("accepts object input", () => {
    expect(normalizeSettings({ notifyOnCrash: false }).notifyOnCrash).toBe(false);
  });
});

describe("decide", () => {
  it("never notifies for idle/starting", () => {
    expect(decide("starting", "idle", settings).notify).toBe(false);
    expect(decide(null, "starting", settings).notify).toBe(false);
  });

  it("notifies ready when enabled", () => {
    const decision = decide("starting", "running", settings);
    expect(decision.notify).toBe(true);
    expect(decision.title).toContain("就绪");
  });

  it("respects notifyOnReady=false", () => {
    const off = { ...settings, notifyOnReady: false };
    expect(decide("starting", "running", off).notify).toBe(false);
  });

  it("notifies crash and error by default", () => {
    expect(decide("running", "crashed", settings).notify).toBe(true);
    expect(decide("running", "error", settings).notify).toBe(true);
  });

  it("skips stopped on first report but honours toggle afterwards", () => {
    expect(decide(null, "stopped", settings).notify).toBe(false);
    expect(decide("running", "stopped", settings).notify).toBe(false);
    const on = { ...settings, notifyOnStop: true };
    expect(decide("running", "stopped", on).notify).toBe(true);
  });
});

describe("formatLogLine", () => {
  it("includes state and notified marker", () => {
    const line = formatLogLine("running", true, new Date("2026-08-30T00:00:00").getTime());
    expect(line).toContain("running");
    expect(line).toContain("已通知");
  });
});
