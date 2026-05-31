import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
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

// Get navigation items based on role and context
function getNavSections(
  userRole: string | null,
  accountingMode: boolean,
  isAccountant: boolean,
  counts: { pendingRequests: number; pendingExpenses: number; approvedExpenses: number }
): NavSection[] {
  // Owner - full access
  if (userRole === 'owner') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        ],
      },
      {
        title: 'Management',
        items: [
          { title: 'Users', href: '/users', icon: Users },
          { title: 'Staff', href: '/staff', icon: Briefcase },
        ],
      },
      {
        title: 'Finance',
        items: [
          { title: 'Ledger', href: '/ledger', icon: FileText },
          { 
            title: 'Request Advance', 
            href: '/requests', 
            icon: ClipboardList,
            badge: counts.pendingRequests,
          },
          { 
            title: 'Expenses', 
            href: '/expenses', 
            icon: Receipt,
            badge: counts.pendingExpenses,
          },
          { 
            title: 'Payouts', 
            href: '/payouts', 
            icon: CreditCard,
            badge: counts.approvedExpenses,
          },
          { title: 'Petty Cash', href: '/petty-cash', icon: Coins },
        ],
      },
      {
        title: 'Salary',
        items: [
          { title: 'Salaries & Advances', href: '/salaries-advances', icon: Wallet },
          { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
          { title: 'Settlements', href: '/settlements', icon: Calculator },
        ],
      },
      {
        title: 'Reports',
        items: [
          { title: 'Attendance', href: '/attendance', icon: Clock },
          { title: 'Shifts', href: '/shifts', icon: Briefcase },
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
        title: 'Management',
        items: [
          { title: 'Staff', href: '/staff', icon: Briefcase },
        ],
      },
      {
        title: 'Finance',
        items: [
          { title: 'Ledger', href: '/ledger', icon: FileText },
          { 
            title: 'Request Advance', 
            href: '/requests', 
            icon: ClipboardList,
            badge: counts.pendingRequests,
          },
          { 
            title: 'Expenses', 
            href: '/expenses', 
            icon: Receipt,
            badge: counts.pendingExpenses,
          },
          { 
            title: 'Payouts', 
            href: '/payouts', 
            icon: CreditCard,
            badge: counts.approvedExpenses,
          },
          { title: 'Petty Cash', href: '/petty-cash', icon: Coins },
          { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
        ],
      },
      {
        title: 'Reports',
        items: [
          { title: 'Attendance', href: '/attendance', icon: Clock },
          { title: 'Shifts', href: '/shifts', icon: Briefcase },
          
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
      // My Account context (personal/employee view)
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
      // Accounting context (finance operator view) - No direct payments, only payouts
      return [
        {
          title: 'Accounting',
          items: [
            { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { title: 'Staff', href: '/staff', icon: Briefcase },
            { title: 'Request Advance', href: '/requests', icon: ClipboardList },
            { 
              title: 'Expenses', 
              href: '/expenses', 
              icon: Receipt,
            },
            { 
              title: 'Payouts', 
              href: '/payouts', 
              icon: CreditCard,
              badge: counts.approvedExpenses,
            },
            { title: 'Leave Records', href: '/leave-records', icon: CalendarDays },
            { title: 'Ledger', href: '/ledger', icon: FileText },
            { title: 'Reports', href: '/reports', icon: BarChart3 },
            { title: 'Settings', href: '/settings', icon: Settings },
          ],
        },
      ];
    }
  }

  // Staff - personal view only
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

  // CA - read-only access
  if (userRole === 'ca') {
    return [
      {
        items: [
          { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { title: 'Ledger', href: '/ledger', icon: FileText },
          { title: 'Attendance', href: '/attendance', icon: Clock },
          { title: 'Reports', href: '/reports', icon: BarChart3 },
          { title: 'Audit Log', href: '/audit-log', icon: History },
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
  const { userRole, staffData, signOut, isAccountant, accountingMode, setAccountingMode, user } = useAuth();
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

  const navSections = getNavSections(userRole, accountingMode, isAccountant, counts.counts);

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
            <img src="/logo.webp" alt="Konnect 2 Hospitality" className="h-full w-full object-contain" />
          </div>
          {!isCollapsed && (
            <div className="animate-fade-in leading-tight">
              <span className="text-sm font-bold text-sidebar-foreground block">Konnect 2 Hospitality</span>
              <p className="text-[10px] text-sidebar-muted">Payroll System</p>
            </div>
          )}
        </div>
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
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white font-medium shadow-sm' 
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
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white' 
                      : 'bg-sidebar-accent/40 text-sidebar-muted hover:text-sidebar-foreground'
                  )}
                  onClick={() => setAccountingMode(!accountingMode)}
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
                            <Link to={item.href}>
                              {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gradient-to-b from-amber-400 to-orange-500 rounded-r-full" />
                              )}
                              <div className="relative flex items-center justify-center w-5 h-5">
                                <item.icon className={cn(
                                  'h-4 w-4',
                                  isActive ? 'text-amber-400' : 'text-sidebar-muted'
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
            <button className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-sidebar-accent/50 group",
              isCollapsed && "justify-center px-2"
            )}>
              <Avatar className="h-8 w-8 border border-sidebar-accent shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-white text-[10px] font-medium">
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
  const { user, staffData, userRole, isAccountant, accountingMode, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const counts = useNotificationCounts();

  const navSections = getNavSections(userRole, accountingMode, isAccountant, counts.counts);
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
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/50 bg-card/80 backdrop-blur-xl px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={toggleSidebar}
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
      </div>
      
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="hidden sm:flex items-center gap-3">
          <div className="h-6 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors cursor-pointer">
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-col flex-1 overflow-x-hidden">
          <AppHeader />
          <main className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 animate-fade-in">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
