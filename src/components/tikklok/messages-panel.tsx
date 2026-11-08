import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, Trash2 } from "lucide-react";
import {
  listEmployeeMessages,
  createEmployeeMessage,
  deleteEmployeeMessage,
  setEmployeeMessageActive,
  listEmployees,
} from "@/lib/tikklok/admin.functions";

const ALL = "__all__";

export function MessagesPanel() {
  const fetchMessages = useServerFn(listEmployeeMessages);
  const fetchEmployees = useServerFn(listEmployees);
  const create = useServerFn(createEmployeeMessage);
  const remove = useServerFn(deleteEmployeeMessage);
  const toggle = useServerFn(setEmployeeMessageActive);
  const qc = useQueryClient();

  const [target, setTarget] = useState<string>(ALL);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expires, setExpires] = useState("");

  const messagesQ = useQuery({ queryKey: ["tikklok:employee-messages"], queryFn: () => fetchMessages({}) });
  const employeesQ = useQuery({ queryKey: ["tikklok:employees"], queryFn: () => fetchEmployees({}) });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["tikklok:employee-messages"] });

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          employee_id: target === ALL ? null : target,
          title,
          body,
          expires_on: expires || null,
        },
      }),
    onSuccess: () => {
      toast.success("Bericht geplaatst — de medewerker ziet het bij het intikken");
      setTitle("");
      setBody("");
      setExpires("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Opslaan mislukt"),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Bericht verwijderd"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Verwijderen mislukt"),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Bijwerken mislukt"),
  });

  const employees = (employeesQ.data ?? []) as { id: string; name: string; active?: boolean }[];

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="heading-display text-2xl">Nieuw bericht</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          De medewerker krijgt dit bericht als pop-up bij het intikken en moet het bevestigen.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Voor wie?</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle medewerkers</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="msg-expires">Toon tot (optioneel)</Label>
            <Input id="msg-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="msg-title">Titel</Label>
          <Input id="msg-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Bv. Teamvergadering vrijdag" />
        </div>
        <div>
          <Label htmlFor="msg-body">Bericht</Label>
          <Textarea id="msg-body" value={body} maxLength={2000} rows={4} onChange={(e) => setBody(e.target.value)} placeholder="Wat moet de medewerker weten?" />
        </div>
        <Button onClick={() => createM.mutate()} disabled={createM.isPending || !title.trim() || !body.trim()}>
          Bericht plaatsen
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="heading-display text-2xl mb-4">Geplaatste berichten</h3>
        {messagesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : (messagesQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Er zijn nog geen berichten geplaatst.</p>
        ) : (
          <ul className="divide-y">
            {(messagesQ.data ?? []).map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{m.title}</p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{m.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {m.employee_name ? m.employee_name : "Alle medewerkers"}
                      {" · "}
                      {new Date(m.created_at).toLocaleDateString("nl-BE")}
                      {m.expires_on ? ` · tot ${new Date(m.expires_on).toLocaleDateString("nl-BE")}` : ""}
                      {` · ${m.read_count} keer gelezen`}
                      {m.active ? "" : " · gearchiveerd"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleM.mutate({ id: m.id, active: !m.active })}
                    >
                      {m.active ? "Archiveren" : "Heractiveren"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeM.mutate(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
