import test from "node:test";
import assert from "node:assert/strict";
import { analysisProcessEnv } from "../src/analyzer.js";

test("analysis isolates bundled Python from user paths, user-site packages and startup overrides", () => {
  const env = analysisProcessEnv({ PATH: "system-path", PYTHONHOME: "foreign-home", PythonPath: "foreign-path", PYTHONSTARTUP: "foreign-script", PYTHONUSERBASE: "foreign-site", PYTHONINSPECT: "1", NORMAL_SETTING: "kept" });
  assert.equal(env.PYTHONHOME, undefined);
  assert.equal(env.PYTHONSTARTUP, undefined);
  assert.equal(env.PYTHONUSERBASE, undefined);
  assert.equal(env.PYTHONINSPECT, undefined);
  assert.equal(env.PythonPath, undefined);
  assert.ok(!env.PYTHONPATH.includes("foreign"));
  assert.equal(env.PYTHONNOUSERSITE, "1");
  assert.equal(env.PYTHONSAFEPATH, "1");
  assert.equal(env.PYTHONUTF8, "1");
  assert.equal(env.NORMAL_SETTING, "kept");
});
