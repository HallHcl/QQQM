import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/state/EmptyState";
import type { Environment } from "@/types";

interface Props {
  environments: Environment[];
  value: string | undefined;
  onValueChange: (id: string) => void;
}

export default function EnvironmentTabs({ environments, value, onValueChange }: Props) {
  if (environments.length === 0) {
    return <EmptyState title="No environments yet" />;
  }

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList>
        {environments.map((env) => (
          <TabsTrigger key={env.id} value={env.id}>
            {env.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
