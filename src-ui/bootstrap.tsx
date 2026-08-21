import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { initializeControlDatabase } from "./lib/control-db";
import {packagedSelfTestConfig,runPackagedSelfTest} from "./lib/packaged-self-test";
import {invoke} from "./lib/tauri";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Control's root application element is missing.");
}

void initializeControlDatabase().then(async() => {
  const config=await packagedSelfTestConfig();
  if(config){const result=await runPackagedSelfTest(config);ReactDOM.createRoot(root).render(<main className="workbench-empty"><h2>{result.passed?"Packaged self-test passed":"Packaged self-test failed"}</h2>{result.checks.map(check=><p key={check.name}>{check.passed?"✓":"✗"} {check.name}{check.detail?` — ${check.detail}`:""}</p>)}{result.error&&<p>{result.error}</p>}</main>);return;}
  ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
}).catch((error) => {
  ReactDOM.createRoot(root).render(
    <div className="workbench-error"><h2>FeltDB failed to start</h2><p>{error instanceof Error ? error.message : String(error)}</p><button onClick={() => window.location.reload()}>Retry</button><button onClick={async()=>{const response=await invoke("cmd_data_topology_use_local");if(response.success)window.location.reload();}}>Return to local data</button></div>
  );
});
