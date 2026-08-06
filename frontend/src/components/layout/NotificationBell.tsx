import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import type { Schedule } from "@/types";

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell() {
  const navigate = useNavigate();

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", { status: "pending" }],
    queryFn: async () => {
      const { data } = await api.get<Schedule[]>("/schedules", {
        params: { status: "pending" },
      });
      return data;
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  const today = startOfDay(new Date());
  const dueSchedules = schedules.filter(
    (schedule) => !isBefore(today, startOfDay(new Date(schedule.scheduled_date)))
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {dueSchedules.length > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-xs">
              {dueSchedules.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Due schedules</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {dueSchedules.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            Nothing due right now.
          </div>
        )}
        {dueSchedules.map((schedule) => (
          <DropdownMenuItem
            key={schedule.id}
            onClick={() => navigate("/schedule")}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-medium">{schedule.title}</span>
            <span className="text-xs text-muted-foreground">
              {schedule.type} &middot; due {format(new Date(schedule.scheduled_date), "PP")}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
