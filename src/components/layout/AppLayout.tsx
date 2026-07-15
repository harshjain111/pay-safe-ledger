import { useEffect, Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { permissionForPath } from '@/lib/route-permissions';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ORGANIZATION } from '@/lib/brand';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  Calculator,
  User,
  Wallet,
  Receipt,
  History,
  UserPlus,
  PanelLeftClose,
  PanelLeft,
  Briefcase,
  ArrowUpRight,
  CalendarDays,
  Coins,
  Clock,
  MessageSquare,
  Fingerprint,
  CalendarCheck,
  CalendarRange,
  Scale,
  ShieldCheck,
  Users2,
  HandCoins,
  RefreshCw,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  badge?: number;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

// Public entry: build the role's nav, then drop any management item whose mapped
// permission the user lacks (audit P0-M2 — nav follows can(), so a revoked
// permission removes its link). Self-service items have no mapped permission and
// always show. Owners pass every check (can() short-circuits on owner).
function getNavSections(
  userRole: string | null,
  accountingMode: boolean,
  isAccountant: boolean,
  counts: { pendingRequests: number; pendingExpenses: number; approvedExpenses: number },
  can: (permission: string) => boolean
): NavSection[] {
  return roleNavSections(userRole, accountingMode, isAccountant, counts)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const required = permissionForPath(item.href);
        return !required || can(required);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

// Role -> nav taxonomy (the base lists; filtered by getNavSections above).
function roleNavSections(
  userRole: string | null,
  accountingMode: boolean,
  isAccountant: boolean,
  counts: { pendingRequests: number; pendingExpenses: number; approvedExpenses: number }
): NavSection[] {
  // Pending items awaiting approval — surfaced as ONE badge on the merged
  // "Approvals" item (advances + expenses).
  const pendingApprovals = counts.pendingRequests + counts.pendingExpenses;

  // Owner - full access
  if (userRole === 'owner') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        ],
      },
      {
        title: 'People',
        items: [
          { title: 'Staff', href: '/staff', icon: Briefcase },
          { title: 'Users', href: '/users', icon: Users },
          { title: 'Rights Templates', href: '/rights-templates', icon: ShieldCheck },
          { title: 'Biometric Enrolment', href: '/biometric-enrolment', icon: Fingerprint },
        ],
      },
      {
        title: 'Attendance & Shifts',
        items: [
          { title: 'Attendance', href: '/attendance', icon: Clock },
          { title: 'Shifts', href: '/shifts', icon: Briefcase },
          { title: 'Shift Assignment', href: '/shift-assignment', icon: CalendarRange },
          { title: 'Week Off', href: '/week-off', icon: CalendarDays },
          { title: 'Duty Roster', href: '/roster', icon: CalendarDays },
          { title: 'Bulk Attendance', href: '/bulk-attendance', icon: Users2 },
        ],
      },
      {
        title: 'Leave',
        items: [
          { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
          { title: 'Leave Types', href: '/leave-types', icon: CalendarRange },
          { title: 'Leave Assign', href: '/leave-assign', icon: UserPlus },
          { title: 'Leave Balance', href: '/leave-balance', icon: Scale },
          { title: 'Holidays', href: '/holidays', icon: CalendarCheck },
          { title: 'Holiday Templates', href: '/holiday-templates', icon: CalendarRange },
          { title: 'Holiday Assign', href: '/holiday-assign', icon: UserPlus },
        ],
      },
      {
        title: 'Approvals',
        items: [
          { title: 'Approvals', href: '/approvals', icon: ClipboardList, badge: pendingApprovals },
        ],
      },
      {
        title: 'Payroll',
        items: [
          { title: 'Salaries & Advances', href: '/salaries-advances', icon: Wallet },
          { title: 'Settlements', href: '/settlements', icon: Calculator },
          { title: 'Payroll Groups', href: '/payroll-groups', icon: Users2 },
          { title: 'Arrears', href: '/arrears', icon: HandCoins },
          { title: 'Payouts', href: '/payouts', icon: CreditCard, badge: counts.approvedExpenses },
        ],
      },
      {
        title: 'Finance',
        items: [
          { title: 'Ledger', href: '/ledger', icon: FileText },
          { title: 'Petty Cash', href: '/petty-cash', icon: Coins },
          { title: 'Expenses', href: '/expenses', icon: Receipt },
        ],
      },
      {
        title: 'Reports',
        items: [
          { title: 'Reports', href: '/reports', icon: BarChart3 },
          { title: 'Audit Log', href: '/audit-log', icon: History },
        ],
      },
      {
        title: 'Account',
        items: [
          { title: 'Settings', href: '/settings', icon: Settings },
        ],
      },
    ];
  }

  // Admin - can approve, execute payouts (no salary), add staff
  if (userRole === 'admin') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        ],
      },
      {
        title: 'People',
        items: [
          { title: 'Staff', href: '/staff', icon: Briefcase },
          { title: 'Rights Templates', href: '/rights-templates', icon: ShieldCheck },
          { title: 'Biometric Enrolment', href: '/biometric-enrolment', icon: Fingerprint },
        ],
      },
      {
        title: 'Attendance & Shifts',
        items: [
          { title: 'Attendance', href: '/attendance', icon: Clock },
          { title: 'Shifts', href: '/shifts', icon: Briefcase },
          { title: 'Shift Assignment', href: '/shift-assignment', icon: CalendarRange },
          { title: 'Week Off', href: '/week-off', icon: CalendarDays },
          { title: 'Duty Roster', href: '/roster', icon: CalendarDays },
          { title: 'Bulk Attendance', href: '/bulk-attendance', icon: Users2 },
        ],
      },
      {
        title: 'Leave',
        items: [
          { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
          { title: 'Leave Types', href: '/leave-types', icon: CalendarRange },
          { title: 'Leave Assign', href: '/leave-assign', icon: UserPlus },
          { title: 'Leave Balance', href: '/leave-balance', icon: Scale },
          { title: 'Holidays', href: '/holidays', icon: CalendarCheck },
          { title: 'Holiday Templates', href: '/holiday-templates', icon: CalendarRange },
          { title: 'Holiday Assign', href: '/holiday-assign', icon: UserPlus },
        ],
      },
      {
        title: 'Approvals',
        items: [
          { title: 'Approvals', href: '/approvals', icon: ClipboardList, badge: pendingApprovals },
        ],
      },
      {
        title: 'Payroll',
        items: [
          { title: 'Payouts', href: '/payouts', icon: CreditCard, badge: counts.approvedExpenses },
        ],
      },
      {
        title: 'Finance',
        items: [
          { title: 'Ledger', href: '/ledger', icon: FileText },
          { title: 'Petty Cash', href: '/petty-cash', icon: Coins },
          { title: 'Expenses', href: '/expenses', icon: Receipt },
        ],
      },
      {
        title: 'Reports',
        items: [
          { title: 'Reports', href: '/reports', icon: BarChart3 },
        ],
      },
      {
        title: 'Account',
        items: [
          { title: 'Settings', href: '/settings', icon: Settings },
        ],
      },
    ];
  }

  // Accountant - dual context
  if (isAccountant) {
    if (!accountingMode) {
      // My Account context (personal/employee self-service view) — unchanged
      return [
        {
          title: 'My Account',
          items: [
            { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { title: 'My Ledger', href: '/ledger', icon: FileText },
            { title: 'My Expenses', href: '/expenses', icon: Receipt },
            { title: 'Request Advance', href: '/requests', icon: ClipboardList },
            { title: 'My Attendance', href: '/my-attendance', icon: Clock },
            { title: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    } else {
      // Accounting context (finance operator view) — management taxonomy
      return [
        {
          items: [
            { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          ],
        },
        {
          title: 'People',
          items: [
            { title: 'Staff', href: '/staff', icon: Briefcase },
          ],
        },
        {
          title: 'Leave',
          items: [
            { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
          ],
        },
        {
          title: 'Approvals',
          items: [
            { title: 'Approvals', href: '/approvals', icon: ClipboardList, badge: pendingApprovals },
          ],
        },
        {
          title: 'Payroll',
          items: [
            { title: 'Payouts', href: '/payouts', icon: CreditCard, badge: counts.approvedExpenses },
          ],
        },
        {
          title: 'Finance',
          items: [
            { title: 'Ledger', href: '/ledger', icon: FileText },
            { title: 'Expenses', href: '/expenses', icon: Receipt },
          ],
        },
        {
          title: 'Reports',
          items: [
            { title: 'Reports', href: '/reports', icon: BarChart3 },
          ],
        },
        {
          title: 'Account',
          items: [
            { title: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    }
  }

  // Staff - personal view only — self-service, unchanged
  if (userRole === 'staff') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { title: 'My Ledger', href: '/ledger', icon: FileText },
          { title: 'My Expenses', href: '/expenses', icon: Receipt },
          { title: 'Request Advance', href: '/requests', icon: ClipboardList },
          { title: 'My Attendance', href: '/my-attendance', icon: Clock },
          { title: 'Settings', href: '/settings', icon: Settings },
        ],
      },
    ];
  }

  // CA - read-only access — regrouped into the management taxonomy
  if (userRole === 'ca') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Attendance & Shifts',
        items: [
          { title: 'Attendance', href: '/attendance', icon: Clock },
        ],
      },
      {
        title: 'Finance',
        items: [
          { title: 'Ledger', href: '/ledger', icon: FileText },
        ],
      },
      {
        title: 'Reports',
        items: [
          { title: 'Reports', href: '/reports', icon: BarChart3 },
          { title: 'Audit Log', href: '/audit-log', icon: History },
        ],
      },
      {
        title: 'Account',
        items: [
          { title: 'Settings', href: '/settings', icon: Settings },
        ],
      },
    ];
  }

  return [];
}

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  
  return (
    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function AppSidebar() {
  const { userRole, staffData, signOut, isAccountant, accountingMode, setAccountingMode, user, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, setOpenMobile, isMobile } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const counts = useNotificationCounts();

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [location.pathname, isMobile, setOpenMobile]);

  const navSections = getNavSections(userRole, accountingMode, isAccountant, counts.counts, can);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = staffData?.full_name || user?.email || 'User';
  const roleDisplay = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : '';

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Header */}
      <SidebarHeader className="p-3 pb-2">
        <div className={cn(
          "flex items-center gap-3 transition-all duration-200",
          isCollapsed && "justify-center"
        )}>
          <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center shadow-lg shrink-0 p-1">
            <img src="/vibrnd-logo.png" alt="VIBRND HR BUDDY" className="h-full w-full object-contain" />
          </div>
          {!isCollapsed && (
            <div className="animate-fade-in leading-tight min-w-0">
              <span className="text-sm font-bold text-sidebar-foreground block tracking-wide">VIBRND HR BUDDY</span>
              <p className="text-[10px] text-sidebar-muted">HR & Payroll Suite</p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5">
            <div className="h-5 w-5 rounded-md bg-white/90 flex items-center justify-center shrink-0 overflow-hidden">
              {ORGANIZATION.logo ? (
                <img src={ORGANIZATION.logo} alt={ORGANIZATION.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-[9px] font-bold text-sidebar-background">{ORGANIZATION.shortCode}</span>
              )}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-sidebar-muted">Organization</p>
              <p className="text-[11px] font-semibold text-sidebar-foreground truncate">{ORGANIZATION.name}</p>
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* Accountant mode toggle - Cleaner design */}
      {isAccountant && (
        <div className={cn("px-3 pb-3", isCollapsed && "px-2 pb-2")}>
          {!isCollapsed ? (
            <div className="flex items-center rounded-lg bg-sidebar-accent/40 p-0.5">
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  'flex-1 text-xs rounded-md h-8 transition-all gap-1.5',
                  !accountingMode 
                    ? 'bg-sidebar-foreground/10 text-sidebar-foreground font-medium shadow-sm' 
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-transparent'
                )}
                onClick={() => setAccountingMode(false)}
              >
                <User className="h-3.5 w-3.5" />
                My Account
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  'flex-1 text-xs rounded-md h-8 transition-all gap-1.5',
                  accountingMode 
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-transparent'
                )}
                onClick={() => setAccountingMode(true)}
              >
                <Briefcase className="h-3.5 w-3.5" />
                Accounting
              </Button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'w-full h-9 rounded-lg transition-all',
                    accountingMode
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'bg-sidebar-accent/40 text-sidebar-muted hover:text-sidebar-foreground'
                  )}
                  onClick={() => setAccountingMode(!accountingMode)}
                  aria-label={accountingMode ? 'Switch to My Account' : 'Switch to Accounting'}
                >
                  {accountingMode ? <Briefcase className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {accountingMode ? 'Switch to My Account' : 'Switch to Accounting'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Navigation */}
      <SidebarContent className="px-2">
        {navSections.map((section, sectionIdx) => (
          <SidebarGroup key={sectionIdx} className="py-1">
            {section.title && !isCollapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-muted/70 uppercase tracking-wider px-3 mb-1">
                {section.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.href || 
                    (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                  
                  return (
                    <SidebarMenuItem key={item.href}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.title}
                            className={cn(
                              "relative h-9 transition-all duration-150",
                              isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                          >
                            <Link to={item.href} aria-label={item.title}>
                              {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-sidebar-primary rounded-r-full" />
                              )}
                              <div className="relative flex items-center justify-center w-5 h-5">
                                <item.icon className={cn(
                                  'h-4 w-4',
                                  isActive ? 'text-sidebar-primary' : 'text-sidebar-muted'
                                )} />
                                {typeof item.badge === 'number' && item.badge > 0 && isCollapsed && (
                                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive" />
                                )}
                              </div>
                              {!isCollapsed && (
                                <>
                                  <span className="flex-1 text-sm">{item.title}</span>
                                  {typeof item.badge === 'number' && item.badge > 0 && (
                                    <span className="bg-destructive/20 text-destructive text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                      {item.badge}
                                    </span>
                                  )}
                                </>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {isCollapsed && (
                          <TooltipContent side="right" className="text-xs">
                            {item.title}
                            {item.badge && item.badge > 0 && ` (${item.badge})`}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer - User menu */}
      <SidebarFooter className="p-2 mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Account menu for ${displayName}`}
              className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-sidebar-accent/50 group",
              isCollapsed && "justify-center px-2"
            )}>
              <Avatar className="h-8 w-8 border border-sidebar-accent shrink-0">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-medium">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden animate-fade-in min-w-0">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-[10px] text-sidebar-muted">
                    {roleDisplay}
                  </p>
                </div>
              )}
              {!isCollapsed && (
                <Settings className="h-3.5 w-3.5 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors shrink-0" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48 rounded-lg">
            <DropdownMenuLabel className="text-xs">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-md text-sm cursor-pointer" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-3.5 w-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive rounded-md text-sm">
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function AppHeader() {
  const { user, staffData, userRole, isAccountant, accountingMode, signOut, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const counts = useNotificationCounts();

  const navSections = getNavSections(userRole, accountingMode, isAccountant, counts.counts, can);
  const allItems = navSections.flatMap(s => s.items);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = staffData?.full_name || user?.email || 'User';
  const roleDisplay = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : '';

  const currentNavItem = allItems.find(item => 
    location.pathname === item.href || 
    (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
  );

  // Add context indicator for accountant
  const contextLabel = isAccountant ? (accountingMode ? '(Accounting)' : '(Personal)') : '';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-border/50 bg-card/80 backdrop-blur-xl px-4 lg:px-6 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        <div className="hidden sm:block">
          <h1 className="text-base font-semibold text-foreground">
            {currentNavItem?.title || 'Dashboard'}
            {contextLabel && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {contextLabel}
              </span>
            )}
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-[11px] font-medium text-muted-foreground">{ORGANIZATION.name}</span>
        </div>
      </div>
      
      
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => window.location.reload()}
          aria-label="Refresh page"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <NotificationBell />
        <ThemeToggle />
        <div className="hidden sm:flex items-center gap-3">
          <div className="h-6 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Account menu for ${displayName}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors cursor-pointer">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-medium">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{roleDisplay}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg">
              <DropdownMenuLabel className="text-xs">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-md text-sm cursor-pointer">
                <User className="mr-2 h-3.5 w-3.5" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-md text-sm cursor-pointer" onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-3.5 w-3.5" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive rounded-md text-sm cursor-pointer">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

// Content-area placeholder shown only while a lazily-loaded page chunk is
// fetched. It lives INSIDE the layout, so the sidebar + header stay mounted
// and never flash away on navigation.
function ContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export function AppLayout() {
  // Re-mount the content fade only when the route changes — keyed on pathname
  // below — while the sidebar/header stay mounted across navigations.
  const { pathname } = useLocation();

  return (
    <SidebarProvider defaultOpen={true}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="min-h-svh flex w-full overflow-x-hidden">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-col flex-1 overflow-x-hidden">
          <AppHeader />
          <div
            id="main-content"
            tabIndex={-1}
            className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none"
          >
            <Suspense fallback={<ContentSkeleton />}>
              <div key={pathname} className="animate-fade-in">
                <RequirePermission>
                  <Outlet />
                </RequirePermission>
              </div>
            </Suspense>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
