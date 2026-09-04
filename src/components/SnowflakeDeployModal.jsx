import { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  Select,
  Input,
  Checkbox,
  Spin,
  Banner,
} from "@douyinfe/semi-ui";
import { IconTick, IconClose, IconPlay } from "@douyinfe/semi-icons";
import {
  connectDesktopSnowflake,
  disconnectDesktopSnowflake,
  listDesktopSnowflakeProfiles,
  listDesktopConnections,
  executeDesktopSnowflakeDdl,
} from "../erdTool/desktopBridge";
import {
  diagramToCanonicalProject,
  renderCanonicalSnowflakeStatements,
} from "../erdTool/projectAdapter";

function cleanErrorMessage(error, defaultMessage) {
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  return (
    raw
      .replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim() || defaultMessage
  );
}

export default function SnowflakeDeployModal({
  visible,
  onClose,
  diagram,
}) {
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState("");
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [useIfNotExists, setUseIfNotExists] = useState(true);
  const [progressResults, setProgressResults] = useState(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const initialNamespace = useMemo(() => {
    const catalog =
      diagram?.targetNamespace?.catalog || diagram?.targetNamespace?.database;
    const schema = diagram?.targetNamespace?.schema;
    if (catalog && schema) {
      return {
        database: catalog,
        schema: schema,
      };
    }
    if (!diagram) {
      return { database: "MODEL", schema: "PUBLIC" };
    }
    try {
      const project = diagramToCanonicalProject({
        title: diagram?.title || "model",
        tables: diagram?.tables || [],
        relationships: diagram?.relationships || [],
        transform: diagram?.transform || { pan: { x: 0, y: 0 }, zoom: 1 },
        database: "snowflake",
      });
      const firstNs = project?.physical_model?.namespaces?.[0];
      return {
        database: firstNs?.catalog || "MODEL",
        schema: firstNs?.schema || "PUBLIC",
      };
    } catch {
      return {
        database: "MODEL",
        schema: "PUBLIC",
      };
    }
  }, [diagram]);

  const [targetDatabase, setTargetDatabase] = useState(initialNamespace.database);
  const [targetSchema, setTargetSchema] = useState(initialNamespace.schema);

  useEffect(() => {
    setTargetDatabase(initialNamespace.database);
    setTargetSchema(initialNamespace.schema);
  }, [initialNamespace]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profileId, profiles],
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError("");
    setProgressResults(null);
    setDeploySuccess(false);

    Promise.allSettled([
      listDesktopConnections(),
      listDesktopSnowflakeProfiles(),
    ])
      .then(([connectionsResult, cliResult]) => {
        if (!active) return;
        const saved =
          connectionsResult.status === "fulfilled" &&
          Array.isArray(connectionsResult.value)
            ? connectionsResult.value
                .filter(
                  (conn) =>
                    conn.provider === "snowflake" &&
                    conn.capabilities?.forwardEngineering,
                )
                .map((conn) => ({
                  id: conn.id,
                  name: `${conn.name} (Saved)`,
                  rawName: conn.name,
                  type: "saved",
                }))
            : [];

        const cli =
          cliResult.status === "fulfilled" && Array.isArray(cliResult.value)
            ? cliResult.value.map((prof) => ({
                id: `cli:${prof.name}`,
                name: prof.isDefault
                  ? `${prof.name} (CLI default)`
                  : `${prof.name} (CLI)`,
                rawName: prof.name,
                type: "cli",
              }))
            : [];

        const combined = [...saved, ...cli];
        setProfiles(combined);
        if (combined.length) {
          setProfileId(combined[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(cleanErrorMessage(err, "Could not discover profiles."));
      });

    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(() => {
    return () => {
      if (session?.sessionId) {
        void disconnectDesktopSnowflake(session.sessionId);
      }
    };
  }, [session]);

  const statements = useMemo(() => {
    if (!diagram) return [];
    try {
      const safeDiagram = {
        title: diagram.title || "model",
        tables: diagram.tables || [],
        relationships: diagram.relationships || [],
        transform: diagram.transform || { pan: { x: 0, y: 0 }, zoom: 1 },
        database: "snowflake",
      };
      return renderCanonicalSnowflakeStatements(
        diagramToCanonicalProject(safeDiagram),
        {
          databaseOverride: targetDatabase.trim() ? targetDatabase.trim().toUpperCase() : undefined,
          schemaOverride: targetSchema.trim() ? targetSchema.trim().toUpperCase() : undefined,
          replace: !useIfNotExists,
        },
      );
    } catch {
      return [];
    }
  }, [diagram, targetDatabase, targetSchema, useIfNotExists]);

  const handleDeploy = async () => {
    if (!selectedProfile || !statements.length) return;
    setBusy(true);
    setError("");
    setProgressResults(null);
    setDeploySuccess(false);

    let currentSession = session;
    try {
      if (!currentSession) {
        const connectReq =
          selectedProfile.type === "cli"
            ? { mode: "profile", profileName: selectedProfile.rawName }
            : { mode: "savedProfile", profileId: selectedProfile.id };
        currentSession = await connectDesktopSnowflake(connectReq);
        setSession(currentSession);
      }

      const execResult = await executeDesktopSnowflakeDdl({
        sessionId: currentSession.sessionId,
        statements,
      });

      setProgressResults(execResult.results || []);
      if (execResult.ok) {
        setDeploySuccess(true);
      } else {
        const failedItem = (execResult.results || []).find((r) => !r.ok);
        setError(
          failedItem?.error || "Execution halted due to a statement failure.",
        );
      }
    } catch (err) {
      setError(cleanErrorMessage(err, "Deployment failed."));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (session?.sessionId) {
      await disconnectDesktopSnowflake(session.sessionId).catch(() => {});
      setSession(null);
    }
    setError("");
    setProgressResults(null);
    setDeploySuccess(false);
    onClose();
  };

  return (
    <Modal
      title="Deploy to Snowflake"
      visible={visible}
      onCancel={handleClose}
      footer={
        <div className="flex justify-between items-center w-full">
          <Button onClick={handleClose}>
            {deploySuccess ? "Done" : "Cancel"}
          </Button>
          <Button
            data-testid="erd-execute-deploy"
            type="primary"
            theme="solid"
            icon={<IconPlay />}
            loading={busy}
            disabled={busy || !selectedProfile || !statements.length || deploySuccess}
            onClick={handleDeploy}
          >
            {deploySuccess ? "Deployed" : `Deploy ${statements.length} Statements`}
          </Button>
        </div>
      }
      width={720}
      centered
      maskClosable={false}
    >
      <div className="space-y-4" data-testid="snowflake-deploy-modal">
        {error && (
          <Banner
            type="danger"
            fullMode={false}
            description={error}
            closeIcon={null}
          />
        )}
        {deploySuccess && (
          <Banner
            type="success"
            fullMode={false}
            description={`Successfully deployed ${statements.length} statement(s) to Snowflake.`}
            closeIcon={null}
          />
        )}

        <div className="grid grid-cols-1 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Target Connection / Profile</span>
            <Select
              value={profileId}
              onChange={(val) => {
                setProfileId(val);
                setError("");
              }}
              optionList={profiles.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              className="w-full"
              disabled={busy || deploySuccess}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Target Database</span>
            <Input
              value={targetDatabase}
              onChange={setTargetDatabase}
              placeholder="DATABASE"
              disabled={busy || deploySuccess}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Target Schema</span>
            <Input
              value={targetSchema}
              onChange={setTargetSchema}
              placeholder="SCHEMA"
              disabled={busy || deploySuccess}
            />
          </label>
        </div>

        <div>
          <Checkbox
            checked={useIfNotExists}
            onChange={(e) => setUseIfNotExists(e.target.checked)}
            disabled={busy || deploySuccess}
          >
            Use <code>IF NOT EXISTS</code> (safe create; do not drop/replace existing tables)
          </Checkbox>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between border-b border-gray-200 p-2.5 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
            <span className="font-medium text-sm">
              Statements to Execute ({statements.length})
            </span>
            {busy && <Spin size="small" />}
          </div>
          <div className="max-h-56 overflow-auto p-2 space-y-2 text-xs font-mono">
            {statements.map((stmt, idx) => {
              const res = progressResults ? progressResults[idx] : null;
              return (
                <div
                  key={idx}
                  className={`p-2 rounded border flex items-start justify-between gap-2 ${
                    res
                      ? res.ok
                        ? "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                        : "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700"
                      : "bg-gray-50/50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-700"
                  }`}
                >
                  <div className="flex-1 overflow-x-auto whitespace-pre-wrap break-all">
                    {stmt}
                    {res && !res.ok && res.error && (
                      <div className="mt-1 text-red-600 dark:text-red-400 font-sans">
                        Error: {res.error}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {res ? (
                      res.ok ? (
                        <IconTick className="text-green-600" />
                      ) : (
                        <IconClose className="text-red-600" />
                      )
                    ) : (
                      <span className="text-gray-400">{idx + 1}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
