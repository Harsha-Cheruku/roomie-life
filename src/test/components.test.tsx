import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, mockAuthContext } from "./test-utils";
import { BottomNav } from "@/components/layout/BottomNav";
import { FloatingActionButton } from "@/components/home/FloatingActionButton";
import { QuickActions } from "@/components/home/QuickActions";
import { SoloModeToggle } from "@/components/home/SoloModeToggle";

describe("BottomNav Component", () => {
  it("should render all 5 nav items", () => {
    const onTabChange = vi.fn();
    renderWithProviders(<BottomNav activeTab="home" onTabChange={onTabChange} />);
    
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("should highlight active tab", () => {
    const onTabChange = vi.fn();
    renderWithProviders(<BottomNav activeTab="tasks" onTabChange={onTabChange} />);
    
    const tasksButton = screen.getByText("Tasks").closest("button");
    expect(tasksButton?.className).toContain("bg-primary/10");
  });

  it("should call onTabChange when clicking a tab", async () => {
    const onTabChange = vi.fn();
    const { user } = renderWithProviders(<BottomNav activeTab="home" onTabChange={onTabChange} />);
    
    const tasksTab = screen.getByText("Tasks").closest("button");
    tasksTab?.click();
    expect(onTabChange).toHaveBeenCalledWith("tasks");
  });

  it("should not crash when clicking already active tab", () => {
    const onTabChange = vi.fn();
    renderWithProviders(<BottomNav activeTab="home" onTabChange={onTabChange} />);
    
    const homeTab = screen.getByText("Home").closest("button");
    homeTab?.click();
    expect(onTabChange).toHaveBeenCalledWith("home");
  });
});

describe("FloatingActionButton Component", () => {
  it("should render the FAB button", () => {
    renderWithProviders(<FloatingActionButton />);
    // FAB should have a Plus icon button
    const buttons = document.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("should show action menu items when opened", async () => {
    renderWithProviders(<FloatingActionButton />);
    
    // Click the main FAB button (last button in the fixed container)
    const fabContainer = document.querySelector(".fixed.bottom-24");
    const mainButton = fabContainer?.querySelector("button:last-child") as HTMLButtonElement;
    mainButton?.click();

    // Wait for menu to appear
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Add Expense")).toBeInTheDocument();
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.getByText("Set Alarm")).toBeInTheDocument();
    expect(screen.getByText("Scan Bill")).toBeInTheDocument();
  });
});

describe("QuickActions Component", () => {
  it("should render all quick action buttons", () => {
    renderWithProviders(<QuickActions />);
    
    expect(screen.getByText("Music Sync")).toBeInTheDocument();
    expect(screen.getByText("Games")).toBeInTheDocument();
    expect(screen.getByText("Alarms")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Roommates")).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    renderWithProviders(<QuickActions />);
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
  });
});

describe("SoloModeToggle Component", () => {
  it("should render when user has rooms", () => {
    renderWithProviders(<SoloModeToggle />);
    expect(screen.getByText("Room")).toBeInTheDocument();
  });

  it("should show Room label when not in solo mode", () => {
    renderWithProviders(<SoloModeToggle />);
    expect(screen.getByText("Room")).toBeInTheDocument();
  });
});
