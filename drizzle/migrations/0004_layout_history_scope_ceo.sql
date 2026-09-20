alter table public.user_layout_history drop constraint if exists user_layout_history_scope_check;
alter table public.user_layout_history add constraint user_layout_history_scope_check
  check (scope in ('home','dashboard','ceo'));