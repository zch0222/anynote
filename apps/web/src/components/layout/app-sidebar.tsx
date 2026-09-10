"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { isRouteActive, navigationGroups, newNoteRoute, settingsRoute } from "./navigation";

function NavigationGroup({ group }: { group: (typeof navigationGroups)[number] }) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(true);
  const id = useId();
  const showItems = open || (state === "collapsed" && !isMobile);

  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={<button type="button" />}
        aria-expanded={showItems}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="group-data-[collapsible=icon]:hidden"
      >
        {group.label}
        <ChevronDown className={cn("ml-auto transition-transform", !open && "-rotate-90")} />
      </SidebarGroupLabel>
      <SidebarGroupContent id={id} hidden={!showItems}>
        <SidebarMenu>
          {group.items.map(({ href, title, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
                tooltip={title}
                aria-label={title}
                isActive={isRouteActive(pathname, href)}
                aria-current={isRouteActive(pathname, href) ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <Icon />
                <span>{title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard" />}
              size="lg"
              aria-label="Anynote 工作台"
              onClick={() => setOpenMobile(false)}
            >
              <BookOpen />
              <span className="text-lg font-semibold tracking-tight">Anynote</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={newNoteRoute.href} />}
              tooltip="创建笔记"
              aria-label="创建笔记"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              onClick={() => setOpenMobile(false)}
            >
              <Plus />
              <span>创建笔记</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <nav aria-label="主导航">
          {navigationGroups.map((group) => (
            <NavigationGroup key={group.label} group={group} />
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={settingsRoute.href} />}
              tooltip="设置"
              aria-label="设置"
              isActive={isRouteActive(pathname, settingsRoute.href)}
              aria-current={isRouteActive(pathname, settingsRoute.href) ? "page" : undefined}
              onClick={() => setOpenMobile(false)}
            >
              <settingsRoute.icon />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
