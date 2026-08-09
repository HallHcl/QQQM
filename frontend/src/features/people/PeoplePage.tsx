import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import {
  useDeletePerson,
  usePeople,
  useRestorePerson,
  type PeopleSort,
} from "@/hooks/usePeople";
import type { Person } from "@/types";
import RoleFilterTabs from "./components/RoleFilterTabs";
import PeopleTable from "./components/PeopleTable";
import PersonDetailDialog from "./components/PersonDetailDialog";
import PersonFormDialog from "./components/PersonFormDialog";

const SORT_OPTIONS: { value: PeopleSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

function apiErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

export default function PeoplePage() {
  const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
  const [typeFilter, setTypeFilter] = useState("all");

  const {
    data: people = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = usePeople({
    ...pagination.params,
    sort: pagination.params.sort as PeopleSort | undefined,
    type: typeFilter === "all" ? undefined : typeFilter,
  });

  const totalPages = pageInfo?.total_pages ?? 1;

  const [selected, setSelected] = useState<Person | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Person | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const deletePerson = useDeletePerson();
  const restorePerson = useRestorePerson();

  function handleSelect(person: Person) {
    setSelected(person);
    setDetailOpen(true);
  }

  function openCreateForm() {
    setEditingPerson(undefined);
    setFormOpen(true);
  }

  function openEditForm(person: Person) {
    setEditingPerson(person);
    setFormOpen(true);
  }

  function openDeleteConfirm(person: Person) {
    setDeleteTarget(person);
    setDeleteConfirmOpen(true);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deletePerson.mutate(deleteTarget.id, {
      onSuccess: () => toast({ title: "Person deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete person",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  // Restore's 409 ("Person is not deleted") is a business-rule conflict, not
  // a stale-write conflict — surfaced as a plain error toast, never routed
  // through useConflictResolution/ConflictState. The cascade reverses
  // cleanly (re-enables the linked user, if any) with no data-loss risk, so
  // (matching Clients' restore convention) this is a direct action, not a
  // ConfirmDialog.
  function handleRestore(person: Person) {
    restorePerson.mutate(person.id, {
      onSuccess: () => toast({ title: "Person restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore person",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">People</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search people..."
            value={pagination.search}
            onChange={(e) => pagination.setSearch(e.target.value)}
            className="w-64"
          />
          <RequireRole roles={["admin", "member"]}>
            <Button onClick={openCreateForm}>New person</Button>
          </RequireRole>
        </div>
      </div>

      <RoleFilterTabs value={typeFilter} onValueChange={setTypeFilter} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={pagination.sort} onValueChange={pagination.setSort}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pagination.order} onValueChange={(v) => pagination.setOrder(v as SortOrder)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={pagination.deleted}
          onValueChange={(v) => pagination.setDeleted(v as DeletedFilter)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deleted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState message="Loading people..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : people.length === 0 ? (
        <EmptyState
          title="No people found"
          message={
            pagination.search ? "Try a different search term." : "No people have been added yet."
          }
        />
      ) : (
        <>
          <PeopleTable
            people={people}
            onSelect={handleSelect}
            onEdit={openEditForm}
            onDelete={openDeleteConfirm}
            onRestore={handleRestore}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select
                value={String(pagination.perPage)}
                onValueChange={(v) => pagination.setPerPage(Number(v))}
              >
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={pagination.prevPage}
                disabled={pagination.page <= 1}
              >
                Previous
              </Button>
              <span>
                Page {pagination.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={pagination.nextPage}
                disabled={pagination.page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <PersonDetailDialog person={selected} open={detailOpen} onOpenChange={setDetailOpen} />
      <PersonFormDialog open={formOpen} onOpenChange={setFormOpen} person={editingPerson} />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this person?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be hidden from the active people list. If this person has a linked user account, it will also be disabled, blocking that account's login until this person is restored. Their client associations are not affected.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
