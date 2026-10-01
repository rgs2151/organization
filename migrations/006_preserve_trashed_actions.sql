CREATE TRIGGER prevent_action_hard_delete
BEFORE DELETE ON actions
BEGIN
  SELECT RAISE(ABORT, 'Actions are retained permanently; set deleted_at instead.');
END;
