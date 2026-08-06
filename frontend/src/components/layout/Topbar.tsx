import { useNavigate } from "react-router-dom";
import { LogOut, UserCog } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/useAuth";
import NotificationBell from "./NotificationBell";

function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

export default function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 shadow-none">
      <div />
      <div className="flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback>
                  {user ? initials(user.username) : "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{user?.username ?? "Account"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.email ?? "Signed in"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings/manage-users")}>
              <UserCog className="mr-2 h-4 w-4" />
              Settings &gt; Manage Users
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
