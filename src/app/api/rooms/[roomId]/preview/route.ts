import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { runMatchmaking } from '@/lib/matchmaking';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (!room.script_id) {
    return NextResponse.json({ error: 'No script selected' }, { status: 400 });
  }

  // Get participants
  const { data: participants } = await supabase
    .from('room_participants')
    .select('user_id, profiles(display_name)')
    .eq('room_id', roomId)
    .order('joined_at');

  const participantIds = (participants ?? []).map((p) => p.user_id);
  const participantNames = new Map<string, string>();
  (participants ?? []).forEach((p) => {
    const profile = p.profiles as unknown as { display_name: string } | null;
    participantNames.set(p.user_id, profile?.display_name ?? 'Unknown');
  });

  // ── Run matchmaking for both auto and pick modes ──
  try {
    const result = await runMatchmaking(supabase, {
      roomId,
      scriptId: room.script_id,
      selectionMode: room.selection_mode,
      selectedActId: room.selected_act_id,
      selectedSceneId: room.selected_scene_id,
      participantIds,
      participantNames,
    });

    return NextResponse.json({
      mode: 'pick',
      sceneId: result.sceneId,
      sceneHeading: result.sceneHeading,
      sceneNumber: result.sceneNumber,
      actNumber: result.actNumber,
      totalLines: result.totalLines,
      systemLines: result.systemLines,
      callSheet: result.assignments.map((assignment) => ({
        userId: assignment.userId,
        displayName: assignment.displayName,
        totalLines: assignment.lines.length,
        character: assignment.character,
        dialogueLines: assignment.dialogueCount,
        actionLines: assignment.actionCount,
        lines: assignment.lines.map((line) => ({
          line_id: line.line_id,
          role: line.role,
          character: line.character,
        })),
      })),
      characters: result.characters.map((character) => ({
        name: character.name,
        dialogueLines: character.dialogueCount,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
