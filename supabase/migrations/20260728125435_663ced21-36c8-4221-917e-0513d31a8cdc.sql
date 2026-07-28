
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'create_task(uuid,text,text,task_priority,timestamptz,uuid,text,text)',
    'update_task(uuid,text,text,task_priority,timestamptz,bigint,text,text)',
    'transition_task(uuid,task_status,bigint,text,text)',
    'assign_task(uuid,uuid,text,text,text)',
    'comment_task(uuid,text,text,text)',
    'create_document(uuid,text,text,text[],jsonb,text,bigint,text,text)',
    'update_document(uuid,text,text,text[],bigint,text,text)',
    'upload_document_version(uuid,jsonb,text,bigint,text,text,text)',
    'share_document(uuid,text,uuid,text,text,text)',
    'archive_document(uuid,bigint,text,text)',
    'schedule_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,uuid[],text,text)',
    'update_meeting(uuid,text,text,timestamptz,timestamptz,text,text,bigint,text,text)',
    'cancel_meeting(uuid,text,bigint,text,text)',
    'set_meeting_rsvp(uuid,meeting_rsvp,text,text)',
    'create_workflow(uuid,text,text,jsonb,text,text)',
    'publish_workflow(uuid,bigint,text,text)',
    'start_workflow_run(uuid,jsonb,text,text)',
    'advance_workflow_step(uuid,text,workflow_step_status,jsonb,jsonb,text,text,text)',
    'cancel_workflow_run(uuid,text,text,text)',
    '_emit_outbox_event(uuid,text,text,text,jsonb,text,text)',
    '_resolve_workspace_tenant(uuid)'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, PUBLIC', fn);
  END LOOP;
END $$;
