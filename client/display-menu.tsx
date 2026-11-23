import { useState } from "react";
import { View } from "react-native";
import { useHosts, useProject, useProjects, type ProjectRef } from "@getpaseo/plugin/client";
import type { SidebarSettings } from "../shared/settings";
import { useSidebar } from "./context";
import { MenuBack, MenuItem, MenuSeparator } from "./menu";

type Page = "root" | "grouping" | "sort" | "title" | "show" | "checks" | "hosts" | "projects" | "labels";

const GROUPING_LABEL: Record<SidebarSettings["grouping"], string> = { project: "Project", status: "Status" };
const SORT_LABEL: Record<SidebarSettings["sort"], string> = { manual: "Manual", created: "Created", lastPrompt: "Last prompt" };
const SORT_ICON: Record<SidebarSettings["sort"], string> = { manual: "GripVertical", created: "CalendarPlus", lastPrompt: "MessageSquare" };
const TITLE_LABEL: Record<SidebarSettings["title"], string> = { title: "Title", branch: "Branch name" };
const CHECKS_LABEL: Record<SidebarSettings["checks"], string> = {
  iconAndText: "Icon and text",
  icon: "Icon only",
  hidden: "Hidden",
};

const SHOW_ITEMS: readonly { key: keyof SidebarSettings["show"]; label: string; icon: string }[] = [
  { key: "branch", label: "Branch", icon: "GitBranch" },
  { key: "project", label: "Project", icon: "Folder" },
  { key: "host", label: "Host", icon: "Server" },
  { key: "pullRequest", label: "Pull request", icon: "GitPullRequest" },
  { key: "services", label: "Services", icon: "Globe" },
  { key: "labels", label: "Labels", icon: "Tag" },
];

function toggled(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ProjectFilterItem({ projectRef, checked, onPress }: { projectRef: ProjectRef; checked: boolean; onPress: () => void }) {
  const { palette } = useSidebar();
  const project = useProject(projectRef);
  if (!project) return null;
  return <MenuItem label={project.displayName} icon="Folder" checked={checked} onPress={onPress} palette={palette} />;
}

export function DisplayMenu() {
  const { palette, settings, saveSettings, multiHost, labelNames } = useSidebar();
  const hosts = useHosts();
  const projects = useProjects();
  const [page, setPage] = useState<Page>("root");
  const back = () => setPage("root");

  if (page === "grouping" || page === "sort" || page === "title" || page === "checks") {
    const options =
      page === "grouping"
        ? (["project", "status"] as const).map((value) => ({
            label: GROUPING_LABEL[value],
            icon: value === "project" ? "Folder" : "CircleDashed",
            checked: settings.grouping === value,
            select: () => saveSettings({ grouping: value }),
          }))
        : page === "sort"
          ? (["manual", "created", "lastPrompt"] as const).map((value) => ({
              label: SORT_LABEL[value],
              icon: SORT_ICON[value],
              checked: settings.sort === value,
              select: () => saveSettings({ sort: value }),
            }))
          : page === "title"
            ? (["title", "branch"] as const).map((value) => ({
                label: TITLE_LABEL[value],
                icon: value === "title" ? "Type" : "GitBranch",
                checked: settings.title === value,
                select: () => saveSettings({ title: value }),
              }))
            : (["iconAndText", "icon", "hidden"] as const).map((value) => ({
                label: CHECKS_LABEL[value],
                icon: value === "iconAndText" ? "Captions" : value === "icon" ? "CircleCheck" : "EyeOff",
                checked: settings.checks === value,
                select: () => saveSettings({ checks: value }),
              }));
    const title = { grouping: "Grouping", sort: "Sort", title: "Title", checks: "Checks" }[page];
    return (
      <View>
        <MenuBack title={title} onPress={page === "checks" ? () => setPage("show") : back} palette={palette} />
        {options.map((option) => (
          <MenuItem
            key={option.label}
            label={option.label}
            icon={option.icon}
            checked={option.checked}
            onPress={option.select}
            palette={palette}
          />
        ))}
      </View>
    );
  }

  if (page === "show") {
    return (
      <View>
        <MenuBack title="Show" onPress={back} palette={palette} />
        {SHOW_ITEMS.map((item) => (
          <MenuItem
            key={item.key}
            label={item.label}
            icon={item.icon}
            checked={settings.show[item.key]}
            palette={palette}
            onPress={() => saveSettings({ show: { ...settings.show, [item.key]: !settings.show[item.key] } })}
          />
        ))}
        <MenuItem
          label="Checks"
          icon="CircleCheck"
          value={CHECKS_LABEL[settings.checks]}
          submenu
          onPress={() => setPage("checks")}
          palette={palette}
        />
        <MenuSeparator palette={palette} />
        <MenuItem
          label="Diff stats"
          icon="Diff"
          checked={settings.trailing === "diff"}
          palette={palette}
          onPress={() => saveSettings({ trailing: settings.trailing === "diff" ? "none" : "diff" })}
        />
        <MenuItem
          label="Last activity"
          icon="Clock"
          checked={settings.trailing === "timestamp"}
          palette={palette}
          onPress={() => saveSettings({ trailing: settings.trailing === "timestamp" ? "none" : "timestamp" })}
        />
      </View>
    );
  }

  if (page === "hosts") {
    return (
      <View>
        <MenuBack title="Host" onPress={back} palette={palette} />
        <MenuItem label="All hosts" checked={settings.hostFilter.length === 0} onPress={() => saveSettings({ hostFilter: [] })} palette={palette} />
        {hosts.map((host) => (
          <MenuItem
            key={host.serverId}
            label={host.label}
            icon="Server"
            checked={settings.hostFilter.includes(host.serverId)}
            onPress={() => saveSettings({ hostFilter: toggled(settings.hostFilter, host.serverId) })}
            palette={palette}
          />
        ))}
      </View>
    );
  }

  if (page === "projects") {
    return (
      <View>
        <MenuBack title="Project" onPress={back} palette={palette} />
        <MenuItem label="All projects" checked={settings.projectFilter.length === 0} onPress={() => saveSettings({ projectFilter: [] })} palette={palette} />
        {projects.map((ref) => (
          <ProjectFilterItem
            key={ref.key}
            projectRef={ref}
            checked={settings.projectFilter.includes(ref.key)}
            onPress={() => saveSettings({ projectFilter: toggled(settings.projectFilter, ref.key) })}
          />
        ))}
      </View>
    );
  }

  if (page === "labels") {
    return (
      <View>
        <MenuBack title="Labels" onPress={back} palette={palette} />
        <MenuItem label="All labels" checked={settings.labelFilter.length === 0} onPress={() => saveSettings({ labelFilter: [] })} palette={palette} />
        {labelNames.map((name) => (
          <MenuItem
            key={name}
            label={name}
            icon="Tag"
            checked={settings.labelFilter.includes(name)}
            onPress={() => saveSettings({ labelFilter: toggled(settings.labelFilter, name) })}
            palette={palette}
          />
        ))}
      </View>
    );
  }

  return (
    <View>
      <MenuItem label="Grouping" value={GROUPING_LABEL[settings.grouping]} submenu onPress={() => setPage("grouping")} palette={palette} />
      {settings.grouping === "project" ? (
        <MenuItem label="Sort" value={SORT_LABEL[settings.sort]} submenu onPress={() => setPage("sort")} palette={palette} />
      ) : null}
      <MenuItem label="Title" value={TITLE_LABEL[settings.title]} submenu onPress={() => setPage("title")} palette={palette} />
      <MenuItem label="Show" submenu onPress={() => setPage("show")} palette={palette} />
      {multiHost || projects.length > 1 ? <MenuSeparator palette={palette} /> : null}
      {multiHost ? (
        <MenuItem
          label="Host"
          value={settings.hostFilter.length ? String(settings.hostFilter.length) : undefined}
          submenu
          onPress={() => setPage("hosts")}
          palette={palette}
        />
      ) : null}
      {projects.length > 1 ? (
        <MenuItem
          label="Project"
          value={settings.projectFilter.length ? String(settings.projectFilter.length) : undefined}
          submenu
          onPress={() => setPage("projects")}
          palette={palette}
        />
      ) : null}
      {labelNames.length > 0 ? (
        <>
          <MenuSeparator palette={palette} />
          <MenuItem
            label="Labels"
            value={settings.labelFilter.length ? String(settings.labelFilter.length) : undefined}
            submenu
            onPress={() => setPage("labels")}
            palette={palette}
          />
        </>
      ) : null}
      <MenuSeparator palette={palette} />
      <MenuItem
        label="Show background"
        checked={settings.showBackground}
        onPress={() => saveSettings({ showBackground: !settings.showBackground })}
        palette={palette}
      />
    </View>
  );
}
