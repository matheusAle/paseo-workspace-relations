import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PaseoWorkspace } from "@getpaseo/client";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { usePaseo, useWorkspace, type WorkspaceRef } from "@getpaseo/plugin/client";
import { copyText, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useSidebar } from "./context";
import { useWorkspaceDescriptor } from "./data";
import { useLayer } from "./layer";
import type { Palette } from "./look";
import { MenuBack, MenuItem } from "./menu";

function DialogButton({ label, onPress, primary, destructive, palette }: { label: string; onPress: () => void; primary?: boolean; destructive?: boolean; palette: Palette }) {
  const background = destructive ? palette.danger : primary ? palette.foreground : palette.selected;
  const color = destructive || primary ? palette.surface0 : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: background }}
    >
      <Text style={{ fontSize: 14, color }}>{label}</Text>
    </Pressable>
  );
}

function ArchiveDialog({ workspace, close, onConfirm, palette }: { workspace: PluginWorkspaceSnapshot; close: () => void; onConfirm: () => void; palette: Palette }) {
  return (
    <Modal title="Archive workspace?" open onOpenChange={(open) => (open ? undefined : close())}>
      <Modal.Content>
        <Text style={{ fontSize: 14, color: palette.muted }}>
          "{workspace.name}" has uncommitted changes or unpushed commits. Archiving removes its worktree, and that work
          will be lost.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <DialogButton label="Cancel" onPress={close} palette={palette} />
          <DialogButton
            label="Archive"
            destructive
            onPress={() => {
              close();
              onConfirm();
            }}
            palette={palette}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}

function RenameDialog({ initial, close, onSave, palette }: { initial: string; close: () => void; onSave: (title: string | null) => void; palette: Palette }) {
  const [value, setValue] = useState(initial);
  const save = () => {
    close();
    onSave(value.trim() || null);
  };
  return (
    <Modal title="Rename workspace" open onOpenChange={(open) => (open ? undefined : close())}>
      <Modal.Content>
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          onSubmitEditing={save}
          placeholder="Workspace title"
          placeholderTextColor={palette.extraMuted}
          style={{
            fontSize: 14,
            color: palette.foreground,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: palette.cardBorder,
          }}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <DialogButton label="Cancel" onPress={close} palette={palette} />
          <DialogButton label="Save" primary onPress={save} palette={palette} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** Archive and rename, with the app's guard against archiving a worktree that holds unsaved work. */
type Paseo = ReturnType<typeof usePaseo>;
type WorkspaceHandle = ReturnType<Paseo["workspaces"]["ref"]>;

/** Runs a workspace action, reporting failures, including a host that is no longer connected. */
function onWorkspace(
  paseo: Paseo,
  ref: WorkspaceRef,
  report: (error: unknown) => void,
  action: (handle: WorkspaceHandle) => Promise<unknown>,
): void {
  try {
    void action(paseo.workspaces.ref(ref)).catch(report);
  } catch (error) {
    report(error);
  }
}

export function useWorkspaceActions() {
  const paseo = usePaseo();
  const layer = useLayer();
  const toast = useToast();
  const { palette } = useSidebar();

  const report = useCallback(
    (error: unknown) => toast.error(error instanceof Error ? error.message : String(error)),
    [toast],
  );

  const archive = useCallback(
    (ref: WorkspaceRef, workspace: PluginWorkspaceSnapshot, descriptor: PaseoWorkspace | null) => {
      const run = () =>
        onWorkspace(paseo, ref, report, (handle) =>
          handle.archive().then((result) => {
            if (result.error) toast.error(result.error);
          }),
        );
      const git = descriptor?.gitRuntime;
      const atRisk = workspace.kind === "worktree" && (git?.isDirty === true || (git?.aheadOfOrigin ?? 0) > 0);
      if (!atRisk) {
        run();
        return;
      }
      layer.openDialog((close) => <ArchiveDialog workspace={workspace} close={close} onConfirm={run} palette={palette} />);
    },
    [paseo, layer, toast, report, palette],
  );

  const rename = useCallback(
    (ref: WorkspaceRef, workspace: PluginWorkspaceSnapshot) => {
      layer.openDialog((close) => (
        <RenameDialog
          initial={workspace.title ?? workspace.name}
          close={close}
          palette={palette}
          onSave={(title) => onWorkspace(paseo, ref, report, (handle) => handle.setTitle(title))}
        />
      ));
    },
    [paseo, layer, report, palette],
  );

  return { archive, rename };
}

export function WorkspaceMenu({ workspaceRef, close }: { workspaceRef: WorkspaceRef; close: () => void }) {
  const { palette, labelNames } = useSidebar();
  const paseo = usePaseo();
  const toast = useToast();
  const workspace = useWorkspace(workspaceRef);
  const descriptor = useWorkspaceDescriptor(workspaceRef);
  const { archive, rename } = useWorkspaceActions();
  const [page, setPage] = useState<"root" | "labels">("root");
  if (!workspace) return null;

  const report = (error: unknown) => toast.error(error instanceof Error ? error.message : String(error));
  const directory = descriptor?.workspaceDirectory ?? workspace.directory;

  if (page === "labels") {
    return (
      <View>
        <MenuBack title="Labels" onPress={() => setPage("root")} palette={palette} />
        {labelNames.length === 0 ? (
          <MenuItem label="No labels yet" disabled palette={palette} />
        ) : (
          labelNames.map((name) => {
            const assigned = workspace.labels.includes(name);
            return (
              <MenuItem
                key={name}
                label={name}
                icon="Tag"
                checked={assigned}
                palette={palette}
                onPress={() =>
                  onWorkspace(paseo, workspaceRef, report, (handle) => handle.setLabel(name, { assigned: !assigned }))
                }
              />
            );
          })
        )}
      </View>
    );
  }

  return (
    <View>
      <MenuItem
        label="Copy path"
        icon="Copy"
        palette={palette}
        onPress={() => {
          close();
          void copyText(directory);
        }}
      />
      {workspace.projectKind === "git" && workspace.branch ? (
        <MenuItem
          label="Copy branch name"
          icon="Copy"
          palette={palette}
          onPress={() => {
            close();
            void copyText(workspace.branch ?? "");
          }}
        />
      ) : null}
      <MenuItem
        label="Rename workspace"
        icon="Pencil"
        palette={palette}
        onPress={() => {
          close();
          rename(workspaceRef, workspace);
        }}
      />
      <MenuItem
        label={workspace.pinnedAt ? "Unpin" : "Pin to top"}
        icon={workspace.pinnedAt ? "PinOff" : "Pin"}
        palette={palette}
        onPress={() => {
          close();
          onWorkspace(paseo, workspaceRef, report, (handle) => handle.setPinned(!workspace.pinnedAt));
        }}
      />
      <MenuItem label="Labels" icon="Tag" submenu palette={palette} onPress={() => setPage("labels")} />
      <MenuItem
        label="Archive"
        icon="Archive"
        palette={palette}
        onPress={() => {
          close();
          archive(workspaceRef, workspace, descriptor);
        }}
      />
    </View>
  );
}
