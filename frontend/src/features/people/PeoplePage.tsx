import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import {
  useDeletePerson,
  usePeople,
  useRestorePerson,
  type PeopleSort,
} from "@/hooks/usePeople";
import type { Person } from "@/types";
import PeopleFilterBar from "./components/PeopleFilterBar";
import PeopleTable from "./components/PeopleTable";
import PersonDetailDialog from "./components/PersonDetailDialog";
import PersonFormDialog from "./components/PersonFormDialog";

export default function PeoplePage() {
  const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
  // URL-synced via pagination.getParam/setParams (see usePagination.ts)
  // rather than local useState, so a refresh/shared URL reproduces the same
  // role filter. Matches pre-migration behavior exactly: changing the role
  // tab does not reset the page (only pagination.setSearch does that).
  const typeFilter = pagination.getParam("type") ?? "all";

  function setTypeFilter(value: string) {
    pagination.setParams({ type: value === "all" ? undefined : value });
  }

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
      <PageHeader
        title="People"
        actions={
          <RequireRole roles={["admin", "member"]}>
            <Button onClick={openCreateForm}>New person</Button>
          </RequireRole>
        }
      />

      <PeopleFilterBar
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        search={pagination.search}
        onSearchChange={pagination.setSearch}
        sort={pagination.sort}
        onSortChange={pagination.setSort}
        order={pagination.order}
        onOrderChange={(v: SortOrder) => pagination.setOrder(v)}
        deleted={pagination.deleted}
        onDeletedChange={(v: DeletedFilter) => pagination.setDeleted(v)}
      />

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

          <PaginationControls
            page={pagination.page}
            totalPages={totalPages}
            perPage={pagination.perPage}
            onPrevPage={pagination.prevPage}
            onNextPage={pagination.nextPage}
            onPerPageChange={pagination.setPerPage}
          />
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
