--
-- PostgreSQL database dump
--

\restrict wGXETTyXxRWqJQtNeUWL5rc93CjhXE5dvjiPwuQwLighC5Jxmgazg7oZONphVb2

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: enrollment_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enrollment_status_type AS ENUM (
    'Enrolled',
    'Not Enrolled',
    'Dropped'
);


--
-- Name: _audit(json, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._audit(p_admin json, p_email text, p_action text, p_target text, p_detail jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into audit_log (admin_email, admin_name, action, target, detail)
  values (lower(trim(p_email)), p_admin->>'full_name', p_action, p_target, p_detail);
$$;


--
-- Name: _enr_auth(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._enr_auth(p_email text, p_hash text, p_role text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := to_json(public.login_account(p_email, p_hash));
  if a is null then raise exception 'Not authorized. Please log in again.' using errcode = 'P0001'; end if;
  if a->>'role' <> p_role then
    raise exception 'Your account is not allowed to do this.' using errcode = 'P0001';
  end if;
  return a;
end $$;


--
-- Name: admin_add_student(text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_add_student(p_email text, p_hash text, p_first text, p_last text, p_student_email text, p_student_id text, p_program text, p_year text, p_new_hash text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare a json; sid text := upper(trim(coalesce(p_student_id, ''))); em text := lower(trim(coalesce(p_student_email, '')));
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if sid = '' or trim(coalesce(p_first, '')) = '' or trim(coalesce(p_last, '')) = ''
     or trim(coalesce(p_program, '')) = '' or trim(coalesce(p_year, '')) = '' then
    raise exception 'Fill in the student ID, name, program and year level.' using errcode = 'P0001';
  end if;
  if em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001';
  end if;
  if exists (select 1 from student_profiles where upper(student_id) = sid) then
    raise exception 'That student ID already exists.' using errcode = 'P0001';
  end if;
  if exists (select 1 from student_profiles where lower(email) = em) or exists (select 1 from accounts where email = em) then
    raise exception 'That email is already used.' using errcode = 'P0001';
  end if;
  if p_new_hash is not null and p_new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid password.' using errcode = 'P0001';
  end if;
  insert into student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status)
  values (sid, trim(p_first), trim(p_last), em, trim(p_program), trim(p_year), 'Enrolled');
  if p_new_hash is not null then
    insert into accounts (email, full_name, role, student_id, password_hash)
    values (em, trim(p_first) || ' ' || trim(p_last), 'student', sid, p_new_hash);
  end if;
  perform public._audit(a, p_email, 'student_added', sid, jsonb_build_object('login_created', p_new_hash is not null));
  return json_build_object('ok', true);
end $_$;


--
-- Name: admin_change_password(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_change_password(p_email text, p_hash text, p_new_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid new password.' using errcode = 'P0001';
  end if;
  if p_new_hash = p_hash then
    raise exception 'The new password must be different from the current one.' using errcode = 'P0001';
  end if;
  update accounts set password_hash = p_new_hash, updated_at = now()
   where email = lower(trim(p_email));
  perform public._audit(a, p_email, 'password_changed', lower(trim(p_email)));
  return json_build_object('ok', true);
end $_$;


--
-- Name: admin_clear_grade(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_clear_grade(p_email text, p_hash text, p_enrollment_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from grades_data where enrollment_id = p_enrollment_id;
  perform public._audit(a, p_email, 'grade_cleared', p_enrollment_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_create_admin(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_admin(p_email text, p_hash text, p_new_email text, p_full_name text, p_new_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  a json;
  v text := lower(trim(p_new_email));
  n text := trim(coalesce(p_full_name, ''));
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001';
  end if;
  if length(n) < 3 then
    raise exception 'Enter the admin''s full name (at least 3 characters).' using errcode = 'P0001';
  end if;
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid password.' using errcode = 'P0001';
  end if;
  if exists (select 1 from accounts where email = v) then
    raise exception 'An account with this email already exists.' using errcode = 'P0001';
  end if;
  insert into accounts (email, full_name, role, password_hash)
  values (v, n, 'admin', p_new_hash);
  perform public._audit(a, p_email, 'admin_created', v, jsonb_build_object('name', n));
  return json_build_object('ok', true);
end $_$;


--
-- Name: admin_delete_announcement(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_announcement(p_email text, p_hash text, p_id bigint) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from announcements where announcement_id = p_id;
  perform public._audit(a, p_email, 'announcement_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_assignment(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_assignment(p_email text, p_hash text, p_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from assignments where assignment_id = p_id;
  perform public._audit(a, p_email, 'assignment_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_course(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_course(p_email text, p_hash text, p_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; n int;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  select count(*) into n from enrollment_data where course_code = p_id and enrollment_status::text = 'Enrolled';
  if n > 0 then
    raise exception 'This course still has % enrolled student(s). Remove or transfer them first.', n using errcode = 'P0001';
  end if;
  -- Only dropped or old enrollment records are left: they go with the course.
  delete from grades_data where enrollment_id in (select enrollment_id from enrollment_data where course_code = p_id);
  delete from enrollment_data where course_code = p_id;
  delete from course_materials where course_code = p_id;
  delete from courses where course_code = p_id;
  perform public._audit(a, p_email, 'course_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_module(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_module(p_email text, p_hash text, p_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from modules where module_id = p_id;
  perform public._audit(a, p_email, 'module_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_question(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_question(p_email text, p_hash text, p_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from quiz_questions where question_id = p_id;
  perform public._audit(a, p_email, 'question_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_section(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_section(p_email text, p_hash text, p_id bigint) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  delete from sections where section_id = p_id;
  perform public._audit(a, p_email, 'section_deleted', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_delete_student(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_student(p_email text, p_hash text, p_student_id text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if not exists (select 1 from student_profiles where student_id = p_student_id) then
    raise exception 'That student no longer exists.' using errcode = 'P0001';
  end if;
  delete from grades_data where enrollment_id in (select enrollment_id from enrollment_data where student_id = p_student_id);
  delete from enrollment_data where student_id = p_student_id;
  delete from lesson_progress where student_id = p_student_id;
  delete from quiz_attempts where student_id = p_student_id;
  delete from accounts where student_id = p_student_id and role = 'student';
  delete from student_profiles where student_id = p_student_id;
  perform public._audit(a, p_email, 'student_deleted', p_student_id);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_enroll_student(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_enroll_student(p_email text, p_hash text, p_student_id text, p_course_code integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; c courses; ex enrollment_data; sem text;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  select * into c from courses where course_code = p_course_code;
  if not found then raise exception 'Choose a course.' using errcode = 'P0001'; end if;
  if not exists (select 1 from student_profiles where student_id = p_student_id) then
    raise exception 'Choose a student.' using errcode = 'P0001';
  end if;
  select * into ex from enrollment_data where student_id = p_student_id and course_code = p_course_code limit 1;
  if found then
    if ex.enrollment_status::text = 'Enrolled' then
      raise exception 'The student is already enrolled in this course.' using errcode = 'P0001';
    end if;
    update enrollment_data set enrollment_status = 'Enrolled', enrollment_date = current_date where enrollment_id = ex.enrollment_id;
  else
    sem := coalesce((select semester from enrollment_periods where school_year = c.school_year order by is_active desc, opens_at desc limit 1), '1st Semester');
    begin
      insert into enrollment_data (student_id, course_code, semester, school_year, enrollment_date, enrollment_status)
      values (p_student_id, p_course_code, sem, c.school_year, current_date, 'Enrolled');
    exception when not_null_violation then
      insert into enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status)
      values ((select coalesce(max(enrollment_id), 0) + 1 from enrollment_data), p_student_id, p_course_code, sem, c.school_year, current_date, 'Enrolled');
    end;
  end if;
  perform public._audit(a, p_email, 'student_enrolled', p_student_id, jsonb_build_object('course', c.course_name));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_list_accounts(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_accounts(p_email text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((select json_agg(json_build_object('student_id', student_id, 'email', email, 'status', status))
                   from accounts where role = 'student'), '[]'::json);
end $$;


--
-- Name: admin_list_announcements(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_announcements(p_email text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((select json_agg(t) from (select * from announcements order by created_at desc) t), '[]'::json);
end $$;


--
-- Name: admin_list_audit(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_audit(p_email text, p_hash text, p_limit integer DEFAULT 50) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((
    select json_agg(t) from (
      select at, admin_name, action, target
      from audit_log order by at desc limit least(coalesce(p_limit, 50), 200)
    ) t
  ), '[]'::json);
end $$;


--
-- Name: admin_list_quiz(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_quiz(p_email text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return json_build_object(
    'lessons', coalesce((select json_agg(t) from (
        select lesson_id, subject_id, module_no, lesson_no, title from lessons order by subject_id, module_no, lesson_no) t), '[]'::json),
    'questions', coalesce((select json_agg(q) from (
        select question_id, lesson_id, prompt, options, answer, explanation from quiz_questions order by lesson_id, question_id) q), '[]'::json));
end $$;


--
-- Name: admin_list_quiz_attempts(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_quiz_attempts(p_email text, p_hash text, p_limit integer DEFAULT 300) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((
    select json_agg(t) from (
      select q.student_id, coalesce(s.first_name || ' ' || s.last_name, q.student_id) as student, l.title as lesson,
             q.score, q.total, q.passed, q.taken_at
      from quiz_attempts q
      left join student_profiles s on s.student_id = q.student_id
      left join lessons l on l.lesson_id = q.lesson_id
      order by q.taken_at desc limit least(coalesce(p_limit, 300), 1000)
    ) t), '[]'::json);
end $$;


--
-- Name: admin_list_sections(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_sections(p_email text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((select json_agg(t) from (
    select s.section_id, s.name, s.course_code, c.course_name, s.days, to_char(s.start_time, 'HH24:MI') as start_time,
           to_char(s.end_time, 'HH24:MI') as end_time, s.room,
           coalesce((select json_agg(ss.student_id order by ss.student_id) from section_students ss where ss.section_id = s.section_id), '[]'::json) as student_ids
    from sections s left join courses c on c.course_code = s.course_code order by s.name) t), '[]'::json);
end $$;


--
-- Name: admin_list_submissions(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_submissions(p_email text, p_hash text, p_limit integer DEFAULT 300) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  return coalesce((
    select json_agg(t) from (
      select s.submission_id, s.student_id, coalesce(p.first_name || ' ' || p.last_name, s.student_id) as student,
             a.title as assignment, sb.subject_code as subject, s.content, s.submitted_at, s.late, s.score, s.feedback, s.reviewed_by
      from submissions s
      left join student_profiles p on p.student_id = s.student_id
      left join assignments a on a.assignment_id = s.assignment_id
      left join subjects sb on sb.subject_id = a.subject_id
      order by s.submitted_at desc limit least(coalesce(p_limit, 300), 1000)
    ) t), '[]'::json);
end $$;


--
-- Name: admin_remove_enrollment(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_enrollment(p_email text, p_hash text, p_enrollment_id integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; sid text;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  update enrollment_data set enrollment_status = 'Dropped' where enrollment_id = p_enrollment_id returning student_id into sid;
  if not found then raise exception 'That enrollment no longer exists.' using errcode = 'P0001'; end if;
  perform public._audit(a, p_email, 'enrollment_removed', sid);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_reset_password(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_password(p_email text, p_hash text, p_student_id text, p_new_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid password.' using errcode = 'P0001';
  end if;
  update accounts set password_hash = p_new_hash, updated_at = now() where student_id = p_student_id and role = 'student';
  if not found then raise exception 'This student has no login account yet.' using errcode = 'P0001'; end if;
  perform public._audit(a, p_email, 'password_reset', p_student_id);
  return json_build_object('ok', true);
end $_$;


--
-- Name: admin_review_submission(text, text, bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_review_submission(p_email text, p_hash text, p_id bigint, p_score numeric, p_feedback text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'The score must be from 0 to 100.' using errcode = 'P0001';
  end if;
  update submissions set score = p_score, feedback = nullif(trim(coalesce(p_feedback, '')), ''),
         reviewed_by = a->>'full_name', reviewed_at = now() where submission_id = p_id;
  if not found then raise exception 'That submission no longer exists.' using errcode = 'P0001'; end if;
  perform public._audit(a, p_email, 'submission_reviewed', p_id::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_announcement(text, text, bigint, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_announcement(p_email text, p_hash text, p_id bigint, p_title text, p_body text, p_published boolean) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_body, '')) = '' then
    raise exception 'Enter a title and a message.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into announcements (title, body, published, created_by) values (trim(p_title), trim(p_body), coalesce(p_published, true), a->>'full_name');
  else
    update announcements set title = trim(p_title), body = trim(p_body), published = coalesce(p_published, true) where announcement_id = p_id;
    if not found then raise exception 'That announcement no longer exists.' using errcode = 'P0001'; end if;
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'announcement_created' else 'announcement_edited' end, trim(p_title));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_assignment(text, text, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_assignment(p_email text, p_hash text, p_id integer, p_subject integer, p_title text, p_due text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_title, '')) = '' then raise exception 'Enter a title.' using errcode = 'P0001'; end if;
  if p_due is null or p_due !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then
    raise exception 'Choose a due date and time.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from subjects where subject_id = p_subject) then
    raise exception 'Choose a subject.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into assignments (subject_id, title, due_date) values (p_subject, trim(p_title), p_due::timestamp);
  else
    update assignments set subject_id = p_subject, title = trim(p_title), due_date = p_due::timestamp where assignment_id = p_id;
    if not found then raise exception 'That assignment no longer exists.' using errcode = 'P0001'; end if;
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'assignment_created' else 'assignment_edited' end, trim(p_title));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_course(text, text, integer, integer, text, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_course(p_email text, p_hash text, p_id integer, p_subject integer, p_name text, p_department text, p_units integer, p_instructor text, p_school_year text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_name, '')) = '' or trim(coalesce(p_department, '')) = '' or trim(coalesce(p_instructor, '')) = ''
     or trim(coalesce(p_school_year, '')) = '' or p_units is null or p_units < 1 then
    raise exception 'Fill in the course name, department, units, instructor and school year.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from subjects where subject_id = p_subject) then
    raise exception 'Choose a subject.' using errcode = 'P0001';
  end if;
  if p_id is null then
    begin
      insert into courses (subject_id, course_name, department, units, instructor, school_year)
      values (p_subject, trim(p_name), trim(p_department), p_units, trim(p_instructor), trim(p_school_year));
    exception when not_null_violation then
      insert into courses (course_code, subject_id, course_name, department, units, instructor, school_year)
      values ((select coalesce(max(course_code), 0) + 1 from courses), p_subject, trim(p_name), trim(p_department), p_units, trim(p_instructor), trim(p_school_year));
    end;
  else
    update courses set subject_id = p_subject, course_name = trim(p_name), department = trim(p_department), units = p_units,
           instructor = trim(p_instructor), school_year = trim(p_school_year) where course_code = p_id;
    if not found then raise exception 'That course no longer exists.' using errcode = 'P0001'; end if;
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'course_created' else 'course_edited' end, trim(p_name));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_enrollment_period(text, text, bigint, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_enrollment_period(p_email text, p_hash text, p_period_id bigint, p_school_year text, p_semester text, p_opens timestamp with time zone, p_closes timestamp with time zone, p_drop timestamp with time zone, p_active boolean) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r public.enrollment_periods;
begin
  perform public._enr_auth(p_email, p_hash, 'admin');
  if p_closes <= p_opens then raise exception 'The closing date must be after the opening date.' using errcode = 'P0001'; end if;
  if p_drop is not null and p_drop < p_opens then raise exception 'The dropping deadline cannot be before enrollment opens.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.courses where school_year = p_school_year) then
    raise exception 'No courses exist for that academic year.' using errcode = 'P0001';
  end if;
  if p_period_id is null then
    insert into public.enrollment_periods (school_year, semester, opens_at, closes_at, drop_deadline, is_active, updated_by)
    values (p_school_year, p_semester, p_opens, p_closes, p_drop, coalesce(p_active, true), p_email) returning * into r;
  else
    update public.enrollment_periods set school_year = p_school_year, semester = p_semester, opens_at = p_opens,
           closes_at = p_closes, drop_deadline = p_drop, is_active = coalesce(p_active, true), updated_by = p_email, updated_at = now()
     where period_id = p_period_id returning * into r;
    if not found then raise exception 'That enrollment period no longer exists.' using errcode = 'P0001'; end if;
  end if;
  return row_to_json(r);
exception when unique_violation then
  raise exception 'An enrollment period already exists for that academic year and semester.' using errcode = 'P0001';
end $$;


--
-- Name: admin_save_grade(text, text, integer, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_grade(p_email text, p_hash text, p_enrollment_id integer, p_score numeric, p_remarks text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; rm text := nullif(trim(coalesce(p_remarks, '')), '');
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Enter a score from 0 to 100.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from enrollment_data where enrollment_id = p_enrollment_id) then
    raise exception 'That enrollment no longer exists.' using errcode = 'P0001';
  end if;
  update grades_data set score = p_score, remarks = rm, graded_by = a->>'full_name', graded_at = now()
   where enrollment_id = p_enrollment_id;
  if not found then
    insert into grades_data (enrollment_id, score, remarks, graded_by, graded_at)
    values (p_enrollment_id, p_score, rm, a->>'full_name', now());
  end if;
  perform public._audit(a, p_email, 'grade_returned', p_enrollment_id::text, jsonb_build_object('score', p_score));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_module(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_module(p_email text, p_hash text, p_id integer, p_subject integer, p_no integer, p_title text, p_desc text, p_file text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_title, '')) = '' or p_no is null or p_no < 1 then
    raise exception 'Enter a module number and title.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from subjects where subject_id = p_subject) then
    raise exception 'Choose a subject.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into modules (subject_id, module_no, title, description, file_path, date_uploaded)
    values (p_subject, p_no, trim(p_title), nullif(trim(coalesce(p_desc, '')), ''), trim(coalesce(p_file, '')), now());
  else
    update modules set subject_id = p_subject, module_no = p_no, title = trim(p_title),
           description = nullif(trim(coalesce(p_desc, '')), ''), file_path = trim(coalesce(p_file, ''))
     where module_id = p_id;
    if not found then raise exception 'That module no longer exists.' using errcode = 'P0001'; end if;
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'module_created' else 'module_edited' end, trim(p_title));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_question(text, text, integer, integer, text, jsonb, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_question(p_email text, p_hash text, p_id integer, p_lesson integer, p_prompt text, p_options jsonb, p_answer integer, p_explanation text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; n int;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if not exists (select 1 from lessons where lesson_id = p_lesson) then
    raise exception 'Choose a lesson.' using errcode = 'P0001';
  end if;
  if trim(coalesce(p_prompt, '')) = '' then raise exception 'Enter the question.' using errcode = 'P0001'; end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'Enter the answer options.' using errcode = 'P0001';
  end if;
  n := jsonb_array_length(p_options);
  if n < 2 or n > 6 then raise exception 'A question needs 2 to 6 options.' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_options) o where jsonb_typeof(o) <> 'string' or trim(o #>> '{}') = '') then
    raise exception 'Options cannot be empty.' using errcode = 'P0001';
  end if;
  if p_answer is null or p_answer < 0 or p_answer >= n then
    raise exception 'Choose which option is correct.' using errcode = 'P0001';
  end if;
  if p_id is null then
    begin
      insert into quiz_questions (lesson_id, prompt, options, answer, explanation)
      values (p_lesson, trim(p_prompt), p_options, p_answer, nullif(trim(coalesce(p_explanation, '')), ''));
    exception when not_null_violation then
      insert into quiz_questions (question_id, lesson_id, prompt, options, answer, explanation)
      values ((select coalesce(max(question_id), 0) + 1 from quiz_questions), p_lesson, trim(p_prompt), p_options, p_answer, nullif(trim(coalesce(p_explanation, '')), ''));
    end;
  else
    update quiz_questions set lesson_id = p_lesson, prompt = trim(p_prompt), options = p_options, answer = p_answer,
           explanation = nullif(trim(coalesce(p_explanation, '')), '') where question_id = p_id;
    if not found then raise exception 'That question no longer exists.' using errcode = 'P0001'; end if;
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'question_created' else 'question_edited' end, p_lesson::text);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_save_section(text, text, bigint, text, integer, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_section(p_email text, p_hash text, p_id bigint, p_name text, p_course integer, p_days text, p_start text, p_end text, p_room text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; st time := nullif(trim(coalesce(p_start, '')), '')::time; en time := nullif(trim(coalesce(p_end, '')), '')::time;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_name, '')) = '' then raise exception 'Enter a section name.' using errcode = 'P0001'; end if;
  if not exists (select 1 from courses where course_code = p_course) then
    raise exception 'Choose a course.' using errcode = 'P0001';
  end if;
  if st is not null and en is not null and en <= st then
    raise exception 'The end time must be after the start time.' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into sections (name, course_code, days, start_time, end_time, room)
    values (trim(p_name), p_course, nullif(trim(coalesce(p_days, '')), ''), st, en, nullif(trim(coalesce(p_room, '')), ''));
  else
    update sections set name = trim(p_name), course_code = p_course, days = nullif(trim(coalesce(p_days, '')), ''),
           start_time = st, end_time = en, room = nullif(trim(coalesce(p_room, '')), '') where section_id = p_id;
    if not found then raise exception 'That section no longer exists.' using errcode = 'P0001'; end if;
    -- students no longer enrolled in the new course are removed from the section
    delete from section_students ss where ss.section_id = p_id and not exists (
      select 1 from enrollment_data e where e.student_id = ss.student_id and e.course_code = p_course and e.enrollment_status::text = 'Enrolled');
  end if;
  perform public._audit(a, p_email, case when p_id is null then 'section_created' else 'section_edited' end, trim(p_name));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_set_account_status(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_account_status(p_email text, p_hash text, p_student_id text, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'Invalid status.' using errcode = 'P0001';
  end if;
  update accounts set status = p_status, updated_at = now() where student_id = p_student_id and role = 'student';
  if not found then raise exception 'This student has no login account yet.' using errcode = 'P0001'; end if;
  perform public._audit(a, p_email, 'account_' || p_status, p_student_id);
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_set_section_students(text, text, bigint, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_section_students(p_email text, p_hash text, p_id bigint, p_ids text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; sec sections;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  select * into sec from sections where section_id = p_id;
  if not found then raise exception 'That section no longer exists.' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(p_ids, '{}')) x where not exists (
      select 1 from enrollment_data e where e.student_id = x and e.course_code = sec.course_code and e.enrollment_status::text = 'Enrolled')) then
    raise exception 'Only students enrolled in this course can join the section.' using errcode = 'P0001';
  end if;
  delete from section_students where section_id = p_id;
  insert into section_students (section_id, student_id) select p_id, x from (select distinct unnest(coalesce(p_ids, '{}')) as x) d;
  perform public._audit(a, p_email, 'section_students_set', sec.name, jsonb_build_object('count', coalesce(array_length(p_ids, 1), 0)));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_transfer_enrollment(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_transfer_enrollment(p_email text, p_hash text, p_enrollment_id integer, p_new_course integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; e enrollment_data; c courses;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  select * into e from enrollment_data where enrollment_id = p_enrollment_id;
  if not found then raise exception 'That enrollment no longer exists.' using errcode = 'P0001'; end if;
  select * into c from courses where course_code = p_new_course;
  if not found then raise exception 'Choose a course.' using errcode = 'P0001'; end if;
  if e.course_code = p_new_course then raise exception 'Choose a different course.' using errcode = 'P0001'; end if;
  if exists (select 1 from enrollment_data where student_id = e.student_id and course_code = p_new_course) then
    raise exception 'The student already has an enrollment in that course.' using errcode = 'P0001';
  end if;
  delete from grades_data where enrollment_id = p_enrollment_id;
  update enrollment_data set course_code = p_new_course, school_year = c.school_year, enrollment_status = 'Enrolled'
   where enrollment_id = p_enrollment_id;
  perform public._audit(a, p_email, 'enrollment_transferred', e.student_id, jsonb_build_object('to', c.course_name));
  return json_build_object('ok', true);
end $$;


--
-- Name: admin_update_student(text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_student(p_email text, p_hash text, p_student_id text, p_first text, p_last text, p_program text, p_year text, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json;
begin
  a := public._enr_auth(p_email, p_hash, 'admin');
  if trim(coalesce(p_first, '')) = '' or trim(coalesce(p_last, '')) = '' or trim(coalesce(p_program, '')) = '' or trim(coalesce(p_year, '')) = '' then
    raise exception 'Fill in the name, program and year level.' using errcode = 'P0001';
  end if;
  update student_profiles set first_name = trim(p_first), last_name = trim(p_last), program = trim(p_program),
         year_level = trim(p_year), enrollment_status = p_status::enrollment_status_type
   where student_id = p_student_id;
  if not found then raise exception 'That student no longer exists.' using errcode = 'P0001'; end if;
  update accounts set full_name = trim(p_first) || ' ' || trim(p_last), updated_at = now() where student_id = p_student_id;
  perform public._audit(a, p_email, 'student_edited', p_student_id);
  return json_build_object('ok', true);
end $$;


--
-- Name: complete_lesson(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_lesson(p_email text, p_hash text, p_lesson integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s text := learning_sid(p_email, p_hash); begin
  if exists(select 1 from quiz_questions where lesson_id=p_lesson) and not exists(select 1 from quiz_attempts where student_id=s and lesson_id=p_lesson and passed)
    then raise exception 'Pass the knowledge check (70%%) before completing this lesson.'; end if;
  insert into lesson_progress(student_id,lesson_id,completed_at) values(s,p_lesson,now())
  on conflict(student_id,lesson_id) do update set completed_at=coalesce(lesson_progress.completed_at,now()); end $$;


--
-- Name: drop_course(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.drop_course(p_email text, p_hash text, p_course_code bigint) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; v_sid text; e public.enrollment_data; per public.enrollment_periods;
begin
  a := public._enr_auth(p_email, p_hash, 'student');
  v_sid := a->>'student_id';
  select * into e from public.enrollment_data                  -- filtered by the caller's own id: other students' rows are unreachable
   where student_id::text = v_sid and course_code = p_course_code and enrollment_status = 'Enrolled'
   order by enrollment_id desc limit 1;
  if not found then raise exception 'You are not currently enrolled in that course.' using errcode = 'P0001'; end if;
  select * into per from public.enrollment_periods
   where school_year = e.school_year and semester = e.semester and is_active;
  if not found or now() > coalesce(per.drop_deadline, per.closes_at) then
    raise exception 'The official course-dropping period is closed.' using errcode = 'P0001';
  end if;
  update public.enrollment_data set enrollment_status = 'Dropped' where enrollment_id = e.enrollment_id returning * into e;
  return row_to_json(e);                                       -- grades and submissions are untouched
end $$;


--
-- Name: enroll_course(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enroll_course(p_email text, p_hash text, p_course_code bigint) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a json; v_sid text; per public.enrollment_periods; c public.courses; e public.enrollment_data;
begin
  a := public._enr_auth(p_email, p_hash, 'student');
  v_sid := a->>'student_id';                                   -- identity comes from the account, never the browser
  select * into per from public.enrollment_periods
   where is_active and now() >= opens_at and now() <= closes_at order by opens_at desc limit 1;
  if not found then raise exception 'Enrollment is currently closed.' using errcode = 'P0001'; end if;
  select * into c from public.courses where course_code = p_course_code;
  if not found then raise exception 'That course does not exist.' using errcode = 'P0001'; end if;
  if c.school_year <> per.school_year then
    raise exception 'That course is not offered in the current enrollment period.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('enroll:' || v_sid || ':' || p_course_code::text)); -- serialises repeat/parallel requests
  select * into e from public.enrollment_data
   where student_id::text = v_sid and course_code = p_course_code and school_year = per.school_year
   order by enrollment_id desc limit 1;
  if found and e.enrollment_status = 'Enrolled' then
    raise exception 'You are already enrolled in this course.' using errcode = 'P0001';
  end if;
  if found then                                                -- re-enroll: keep the same row so history and grades stay linked
    update public.enrollment_data set enrollment_status = 'Enrolled' where enrollment_id = e.enrollment_id returning * into e;
  else
    insert into public.enrollment_data (student_id, course_code, semester, school_year, enrollment_date, enrollment_status)
    select r.student_id, r.course_code, r.semester, r.school_year, r.enrollment_date, r.enrollment_status
      from json_populate_record(null::public.enrollment_data, json_build_object(
        'student_id', v_sid, 'course_code', p_course_code, 'semester', per.semester,
        'school_year', per.school_year, 'enrollment_date', (now() at time zone 'Asia/Manila')::date,
        'enrollment_status', 'Enrolled')) r
    returning * into e;
  end if;
  return row_to_json(e);
exception when unique_violation then
  raise exception 'You are already enrolled in this course.' using errcode = 'P0001';
end $$;


--
-- Name: get_enrollment_window(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_enrollment_window() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare p public.enrollment_periods; st text; per json;
begin
  select * into p from public.enrollment_periods
   where is_active and now() >= opens_at and now() <= closes_at order by opens_at desc limit 1;
  if found then st := 'open'; per := row_to_json(p);
  else
    select * into p from public.enrollment_periods where is_active and opens_at > now() order by opens_at limit 1;
    if found then st := 'not_yet_open'; per := row_to_json(p);
    else
      select * into p from public.enrollment_periods where is_active order by closes_at desc limit 1;
      if found then st := 'closed'; per := row_to_json(p); else st := 'none'; per := null; end if;
    end if;
  end if;
  return json_build_object('now', now(), 'status', st, 'period', per);
end $$;


--
-- Name: get_learning(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_learning(p_email text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s text := learning_sid(p_email, p_hash); begin
  return jsonb_build_object(
   'lessons', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('quiz_n',(select count(*) from quiz_questions q where q.lesson_id=l.lesson_id)) order by l.subject_id,l.module_no,l.lesson_no) from lessons l where l.status='published'),'[]'),
   'progress', coalesce((select jsonb_agg(to_jsonb(p)) from lesson_progress p where p.student_id=s),'[]'),
   'attempts', coalesce((select jsonb_agg(jsonb_build_object('lesson_id',lesson_id,'score',score,'total',total,'passed',passed,'taken_at',taken_at) order by taken_at desc) from quiz_attempts where student_id=s),'[]')); end $$;


--
-- Name: get_my_submissions(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_submissions(p_email text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare acct json;
begin
  acct := public.login_account(p_email, p_hash);
  if acct is null or acct->>'role' <> 'student' then return '[]'::json; end if;
  return coalesce((select json_agg(json_build_object('assignment_id', assignment_id, 'student_id', student_id, 'content', content,
           'submitted_at', submitted_at, 'late', late, 'score', score, 'feedback', feedback))
         from submissions where student_id = acct->>'student_id'), '[]'::json);
end $$;


--
-- Name: get_quiz(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_quiz(p_email text, p_hash text, p_lesson integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s text := learning_sid(p_email, p_hash); begin  -- answer keys are never returned here
  return coalesce((select jsonb_agg(jsonb_build_object('question_id',question_id,'prompt',prompt,'options',options) order by question_id) from quiz_questions where lesson_id=p_lesson),'[]'); end $$;


--
-- Name: learning_sid(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_sid(p_email text, p_hash text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a jsonb; begin
  a := to_jsonb(login_account(p_email, p_hash));
  if a is null or a->>'student_id' is null then raise exception 'Please log in as a student to track learning progress.'; end if;
  return a->>'student_id'; end $$;


--
-- Name: login_account(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.login_account(p_email text, p_hash text) RETURNS json
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object('role', role, 'student_id', student_id, 'full_name', full_name)
  from accounts
  where email = lower(trim(p_email)) and password_hash = p_hash and status = 'active';
$$;


--
-- Name: open_lesson(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_lesson(p_email text, p_hash text, p_lesson integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s text := learning_sid(p_email, p_hash); begin
  if not exists(select 1 from lessons where lesson_id=p_lesson and status='published') then raise exception 'Lesson not available.'; end if;
  insert into lesson_progress(student_id,lesson_id) values(s,p_lesson)
  on conflict(student_id,lesson_id) do update set last_opened=now(); end $$;


--
-- Name: signup_account(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signup_account(p_role text, p_first text, p_last text, p_email text, p_student_id text, p_hash text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := lower(trim(p_email));
  v_sid varchar(20) := null;
  r record;
begin
  if p_role is distinct from 'student' then
    raise exception 'Not authorized. Only students can register here. Administrator accounts are created by an administrator.';
  end if;

  select * into r from student_profiles
  where upper(student_id) = upper(trim(coalesce(p_student_id, '')));
  if not found then
    raise exception 'Invalid Student ID. Please enter the Student ID assigned by your university.';
  end if;
  v_sid := r.student_id;
  if exists (select 1 from accounts where student_id = v_sid) then
    raise exception 'An account already exists for this Student ID. Please log in instead.';
  end if;
  if r.enrollment_status::text is distinct from 'Enrolled' then
    raise exception 'This Student ID is not currently eligible for registration. Please contact your university administrator.';
  end if;
  if lower(coalesce(r.email, '')) <> v_email
     or lower(r.first_name) <> lower(trim(p_first))
     or lower(r.last_name) <> lower(trim(p_last)) then
    raise exception 'The name or email you entered does not match the university record for this Student ID.';
  end if;

  if exists (select 1 from accounts where email = v_email) then
    raise exception 'An account with this email already exists.';
  end if;

  begin
    insert into accounts (email, full_name, role, student_id, password_hash)
    values (v_email, trim(p_first) || ' ' || trim(p_last), 'student', v_sid, p_hash);
  exception when unique_violation then
    raise exception 'An account already exists for this email or Student ID.';
  end;

  return json_build_object('ok', true);
end;
$$;


--
-- Name: submit_assignment(text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_assignment(p_email text, p_hash text, p_assignment integer, p_content text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare acct json; sid text; asg assignments; r submissions;
begin
  acct := public.login_account(p_email, p_hash);
  if acct is null then raise exception 'Not authorized. Please log in again.' using errcode = 'P0001'; end if;
  if acct->>'role' <> 'student' then raise exception 'Only students can submit assignments.' using errcode = 'P0001'; end if;
  sid := acct->>'student_id';
  select * into asg from assignments where assignment_id = p_assignment;
  if not found then raise exception 'That assignment no longer exists.' using errcode = 'P0001'; end if;
  if not exists (select 1 from enrollment_data e join courses c on c.course_code = e.course_code
                 where e.student_id = sid and e.enrollment_status::text = 'Enrolled' and c.subject_id = asg.subject_id) then
    raise exception 'You are not enrolled in this course.' using errcode = 'P0001';
  end if;
  if trim(coalesce(p_content, '')) = '' then raise exception 'Submission cannot be empty.' using errcode = 'P0001'; end if;
  if length(p_content) > 20000 then raise exception 'Submission is too long (20,000 characters maximum).' using errcode = 'P0001'; end if;
  if exists (select 1 from submissions where assignment_id = p_assignment and student_id = sid and reviewed_at is not null) then
    raise exception 'This submission has already been reviewed and can no longer be changed.' using errcode = 'P0001';
  end if;
  insert into submissions (assignment_id, student_id, content, late)
  values (p_assignment, sid, p_content, (now() at time zone 'Asia/Manila') > asg.due_date)
  on conflict (assignment_id, student_id)
  do update set content = excluded.content, submitted_at = now(), late = excluded.late
  returning * into r;
  return json_build_object('assignment_id', r.assignment_id, 'student_id', r.student_id, 'content', r.content,
         'submitted_at', r.submitted_at, 'late', r.late, 'score', r.score, 'feedback', r.feedback);
end $$;


--
-- Name: submit_quiz(text, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_quiz(p_email text, p_hash text, p_lesson integer, p_answers jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s text := learning_sid(p_email, p_hash); n int; tot int; sc int; r jsonb; begin
  select count(*) into n from quiz_attempts where student_id=s and lesson_id=p_lesson;
  if n >= 3 then raise exception 'Attempt limit reached (3 attempts).'; end if;
  select count(*), count(*) filter (where (p_answers->>(question_id::text))::int = answer) into tot, sc from quiz_questions where lesson_id=p_lesson;
  if tot = 0 then raise exception 'This lesson has no quiz.'; end if;
  insert into quiz_attempts(student_id,lesson_id,score,total,passed,answers) values(s,p_lesson,sc,tot,sc*100>=tot*70,p_answers);
  select jsonb_agg(jsonb_build_object('question_id',question_id,'answer',answer,'explanation',explanation)) into r from quiz_questions where lesson_id=p_lesson;
  return jsonb_build_object('score',sc,'total',tot,'passed',sc*100>=tot*70,'attempts_left',2-n,'review',r); end $$;


--
-- Name: verify_student_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_student_id(p_student_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    r record;
begin
    select * into r from student_profiles
    where upper(student_id) = upper(trim(coalesce(p_student_id, '')));
    if not found then return 'invalid'; end if;
    if exists (select 1 from accounts where student_id = r.student_id) then return 'exists'; end if;
    if r.enrollment_status::text is distinct from 'Enrolled' then return 'ineligible'; end if;
    return 'ok';
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    account_id integer NOT NULL,
    email character varying(100) NOT NULL,
    full_name character varying(100) NOT NULL,
    role character varying(50) NOT NULL,
    student_id character varying(20),
    password_hash character(64) DEFAULT '50'::bpchar NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text DEFAULT 'active'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_role_check CHECK (((role)::text = ANY (ARRAY[('student'::character varying)::text, ('teacher'::character varying)::text, ('admin'::character varying)::text]))),
    CONSTRAINT accounts_role_chk CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'admin'::character varying])::text[]))),
    CONSTRAINT accounts_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


--
-- Name: accounts_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accounts ALTER COLUMN account_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.accounts_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    announcement_id bigint NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcements_announcement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.announcements ALTER COLUMN announcement_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.announcements_announcement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    assignment_id integer NOT NULL,
    subject_id integer NOT NULL,
    title character varying(150) NOT NULL,
    due_date timestamp without time zone NOT NULL
);


--
-- Name: assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.assignments ALTER COLUMN assignment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.assignments_assignment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    log_id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    admin_email text NOT NULL,
    admin_name text,
    action text NOT NULL,
    target text,
    detail jsonb
);


--
-- Name: audit_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN log_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: authorized_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorized_users (
    email character varying(50) DEFAULT '''50''::character varying'::character varying NOT NULL,
    role character varying(50) DEFAULT '50'::character varying NOT NULL,
    CONSTRAINT authorized_users_role_check CHECK (((role)::text = ANY (ARRAY[('teacher'::character varying)::text, ('admin'::character varying)::text])))
);


--
-- Name: course_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_materials (
    material_id integer NOT NULL,
    course_code integer NOT NULL,
    title character varying(150) NOT NULL,
    content text,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: course_materials_material_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.course_materials ALTER COLUMN material_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.course_materials_material_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    course_code integer NOT NULL,
    subject_id integer,
    course_name character varying(100) NOT NULL,
    department character varying(100) NOT NULL,
    units integer NOT NULL,
    instructor character varying(100) NOT NULL,
    school_year character varying(15) NOT NULL,
    is_main boolean DEFAULT false NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    description text,
    CONSTRAINT courses_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: courses_course_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.courses ALTER COLUMN course_code ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.courses_course_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: enrollment_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_data (
    enrollment_id integer NOT NULL,
    student_id character varying(20) NOT NULL,
    course_code integer NOT NULL,
    semester character varying(20) NOT NULL,
    school_year character varying(15) NOT NULL,
    enrollment_date date NOT NULL,
    enrollment_status public.enrollment_status_type NOT NULL
);


--
-- Name: enrollment_data_enrollment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_data ALTER COLUMN enrollment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.enrollment_data_enrollment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: enrollment_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_periods (
    period_id bigint NOT NULL,
    school_year text NOT NULL,
    semester text NOT NULL,
    opens_at timestamp with time zone NOT NULL,
    closes_at timestamp with time zone NOT NULL,
    drop_deadline timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ep_dates CHECK ((closes_at > opens_at)),
    CONSTRAINT ep_drop CHECK (((drop_deadline IS NULL) OR (drop_deadline >= opens_at)))
);


--
-- Name: enrollment_periods_period_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_periods ALTER COLUMN period_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.enrollment_periods_period_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: grades_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades_data (
    grade_id integer NOT NULL,
    enrollment_id integer NOT NULL,
    score numeric(5,2) NOT NULL,
    remarks character varying(50),
    graded_by text,
    graded_at timestamp with time zone
);


--
-- Name: grades_data_grade_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.grades_data ALTER COLUMN grade_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.grades_data_grade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_progress (
    student_id text NOT NULL,
    lesson_id integer NOT NULL,
    first_opened timestamp with time zone DEFAULT now() NOT NULL,
    last_opened timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    lesson_id integer NOT NULL,
    subject_id integer NOT NULL,
    module_no integer NOT NULL,
    lesson_no integer NOT NULL,
    module_title text NOT NULL,
    title text NOT NULL,
    kind text DEFAULT 'Reading'::text NOT NULL,
    minutes integer DEFAULT 10 NOT NULL,
    summary text,
    objectives text[] DEFAULT '{}'::text[] NOT NULL,
    body_html text,
    resources jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    reviewed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    module_id integer,
    CONSTRAINT lessons_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: lessons_lesson_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lessons_lesson_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lessons_lesson_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lessons_lesson_id_seq OWNED BY public.lessons.lesson_id;


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    module_id integer NOT NULL,
    subject_id integer NOT NULL,
    module_no integer NOT NULL,
    title character varying(150) NOT NULL,
    description text,
    file_path character varying(255) NOT NULL,
    date_uploaded timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status text DEFAULT 'published'::text NOT NULL,
    CONSTRAINT modules_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: modules_module_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.modules ALTER COLUMN module_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.modules_module_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    program_id integer NOT NULL,
    program_code character varying(10) NOT NULL,
    program_name character varying(100) NOT NULL,
    department character varying(100) NOT NULL
);


--
-- Name: programs_program_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.programs ALTER COLUMN program_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.programs_program_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_attempts (
    attempt_id integer NOT NULL,
    student_id text NOT NULL,
    lesson_id integer NOT NULL,
    score integer NOT NULL,
    total integer NOT NULL,
    passed boolean NOT NULL,
    answers jsonb,
    taken_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quiz_attempts_attempt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quiz_attempts_attempt_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quiz_attempts_attempt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quiz_attempts_attempt_id_seq OWNED BY public.quiz_attempts.attempt_id;


--
-- Name: quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_questions (
    question_id integer NOT NULL,
    lesson_id integer NOT NULL,
    prompt text NOT NULL,
    options jsonb NOT NULL,
    answer integer NOT NULL,
    explanation text
);


--
-- Name: quiz_questions_question_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quiz_questions_question_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quiz_questions_question_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quiz_questions_question_id_seq OWNED BY public.quiz_questions.question_id;


--
-- Name: section_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_students (
    section_id bigint NOT NULL,
    student_id text NOT NULL
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    section_id bigint NOT NULL,
    name text NOT NULL,
    course_code integer NOT NULL,
    days text,
    start_time time without time zone,
    end_time time without time zone,
    room text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sections_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sections ALTER COLUMN section_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sections_section_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: student_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_profiles (
    student_id character varying(20) NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    email character varying(100),
    program character varying(50) NOT NULL,
    year_level character varying(50) NOT NULL,
    enrollment_status public.enrollment_status_type NOT NULL,
    CONSTRAINT student_profiles_student_id_check CHECK ((((student_id)::text = TRIM(BOTH FROM student_id)) AND ((student_id)::text <> ''::text)))
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    subject_id integer NOT NULL,
    program_id integer NOT NULL,
    subject_code character varying(20) NOT NULL,
    subject_name character varying(150) NOT NULL,
    units integer NOT NULL,
    year_level character varying(20) NOT NULL,
    semester character varying(20) NOT NULL
);


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subjects ALTER COLUMN subject_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subjects_subject_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    submission_id bigint NOT NULL,
    assignment_id integer NOT NULL,
    student_id text NOT NULL,
    content text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    late boolean DEFAULT false NOT NULL,
    score numeric,
    feedback text,
    reviewed_by text,
    reviewed_at timestamp with time zone
);


--
-- Name: submissions_submission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.submissions ALTER COLUMN submission_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.submissions_submission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: lessons lesson_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons ALTER COLUMN lesson_id SET DEFAULT nextval('public.lessons_lesson_id_seq'::regclass);


--
-- Name: quiz_attempts attempt_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts ALTER COLUMN attempt_id SET DEFAULT nextval('public.quiz_attempts_attempt_id_seq'::regclass);


--
-- Name: quiz_questions question_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions ALTER COLUMN question_id SET DEFAULT nextval('public.quiz_questions_question_id_seq'::regclass);


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.accounts (account_id, email, full_name, role, student_id, password_hash, created_at, status, updated_at) VALUES (6, 'mariasantos@gmail.com', 'Maria Santos', 'student', '2026-0002', '61151bb4a08470a2f08c9ca60f1a314492a4ff40c18830692b2113aee0affe6f', '2026-10-20 06:34:26.742273', 'active', '2026-10-22 23:25:51.143694+00');
INSERT INTO public.accounts (account_id, email, full_name, role, student_id, password_hash, created_at, status, updated_at) VALUES (7, 'juanreyes@gmail.com', 'Juan Reyes', 'student', '2026-0003', 'cb320f005766823d70725399228dc826b78b1c40c4d34716d68fcf8edd26f660', '2026-10-20 07:15:16.080966', 'active', '2026-10-22 23:25:51.143694+00');
INSERT INTO public.accounts (account_id, email, full_name, role, student_id, password_hash, created_at, status, updated_at) VALUES (9, 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'admin', NULL, '84aa068d3282086532e67b59fc1bd525d228d85c6214890f35fe355686105474', '2026-10-20 23:42:15.275107', 'active', '2026-10-22 23:48:54.00888+00');


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: assignments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'Orthographic and Isometric Drawing Plate', '2026-10-30 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (2, 3, 'Series and Parallel DC Circuit Problems', '2026-11-06 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (3, 3, 'Ohm''s Law Laboratory Report', '2026-10-12 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (4, 1, 'Dimensioning Exercise', '2026-11-13 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (5, 2, 'ER Diagram for a Library System', '2026-11-10 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (6, 2, 'SQL Queries Activity', '2026-11-20 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (7, 4, 'Thevenin and Norton Equivalent Problems', '2026-11-13 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (8, 7, 'Truth Table and Logic Gate Simplification', '2026-11-05 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (9, 10, 'Electrical Quantities Worksheet', '2026-11-09 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (10, 12, 'Computer Hardware Research Paper', '2026-11-02 23:59:00');
INSERT INTO public.assignments (assignment_id, subject_id, title, due_date) OVERRIDING SYSTEM VALUE VALUES (11, 13, 'Personal Portfolio Webpage', '2026-11-27 23:59:00');


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (1, '2026-10-22 23:48:54.00888+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'password_changed', 'q8m.vexul.4rkn.edu@gmail.com', NULL);
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (2, '2026-10-23 08:58:08.343451+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'course_edited', 'Autocad', NULL);
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (3, '2026-10-24 01:34:06.335521+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'enrollment_transferred', '2026-0003', '{"to": "Autocad"}');
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (4, '2026-10-24 01:34:26.456423+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'enrollment_transferred', '2026-0003', '{"to": "Autocad"}');
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (5, '2026-10-24 01:35:00.951529+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'enrollment_removed', '2026-0006', NULL);
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (6, '2026-10-24 01:35:07.888255+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'enrollment_removed', '2026-0003', NULL);
INSERT INTO public.audit_log (log_id, at, admin_email, admin_name, action, target, detail) OVERRIDING SYSTEM VALUE VALUES (7, '2026-10-24 01:37:36.802917+00', 'q8m.vexul.4rkn.edu@gmail.com', 'Admin Staff', 'course_deleted', '10', NULL);


--
-- Data for Name: authorized_users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.authorized_users (email, role) VALUES ('faculty.access2026@gmail.com', 'teacher');
INSERT INTO public.authorized_users (email, role) VALUES ('q8m.vexul.4rkn.edu@gmail.com', 'admin');


--
-- Data for Name: course_materials; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'AutoCAD Command Cheat Sheet', 'Common commands: LINE, CIRCLE, OFFSET, TRIM, EXTEND, and DIMLINEAR.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (2, 2, 'Series and Parallel DC Circuits', 'Basic DC circuit analysis', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (3, 2, 'Kirchhoff''s Laws Worked Examples', 'Step-by-step KCL and KVL problems.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (4, 3, 'Relational Database Concepts', 'Tables, primary keys, foreign keys, and normalization (1NF to 3NF).', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (5, 3, 'SQL Practice Set', 'SELECT, INSERT, UPDATE, DELETE, and JOIN exercises.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (6, 5, 'Boolean Algebra Reference', 'Laws and theorems of Boolean algebra with worked examples.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (7, 6, 'Network Theorems Summary', 'Superposition, Thevenin, Norton, and maximum power transfer.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (8, 8, 'Computing Basics Slides', 'Overview of hardware, software, and networks.', '2026-10-20 01:03:16.732524');
INSERT INTO public.course_materials (material_id, course_code, title, content, uploaded_at) OVERRIDING SYSTEM VALUE VALUES (9, 9, 'HTML and CSS Starter Template', 'Boilerplate for the Personal Portfolio Webpage activity.', '2026-10-20 01:03:16.732524');


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (2, 3, 'Electric Circuits 1', 'Engineering', 3, 'Prof. Sermeno', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (3, 2, 'Database', 'Engineering', 3, 'Prof. Reyes', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (4, 5, 'Computer Programming 1', 'Engineering', 3, 'Prof. Lim', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (5, 7, 'Digital Logic Design', 'Engineering', 3, 'Prof. Aquino', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (6, 4, 'Electric Circuits 2', 'Engineering', 3, 'Prof. Sermeno', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (7, 10, 'Introduction to Electrical Engineering', 'Engineering', 3, 'Prof. Castillo', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (8, 12, 'Introduction to Computing', 'CAS', 3, 'Prof. Cruz', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (9, 13, 'Web Development', 'CAS', 3, 'Prof. Domingo', '2026-2027', false, 'published', NULL);
INSERT INTO public.courses (course_code, subject_id, course_name, department, units, instructor, school_year, is_main, status, description) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'Autocad', 'Engineering', 3, 'Prof. Lim', '2026-2027', false, 'published', NULL);


--
-- Data for Name: enrollment_data; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (31, '2026-0001', 1, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (32, '2026-0002', 2, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (33, '2026-0001', 3, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (34, '2026-0001', 5, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (35, '2026-0002', 1, '1st Semester', '2026-2027', '2026-08-16', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (36, '2026-0003', 7, '1st Semester', '2026-2027', '2026-08-16', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (37, '2026-0004', 8, '1st Semester', '2026-2027', '2026-08-17', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (38, '2026-0005', 3, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (39, '2026-0005', 5, '1st Semester', '2026-2027', '2026-08-15', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (40, '2026-0006', 6, '1st Semester', '2026-2027', '2026-08-17', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (41, '2026-0007', 9, '1st Semester', '2026-2027', '2026-08-18', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (42, '2026-0010', 8, '1st Semester', '2026-2027', '2026-08-18', 'Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (43, '2026-0009', 4, '1st Semester', '2026-2027', '2026-08-16', 'Dropped');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (44, '2026-0008', 7, '1st Semester', '2026-2027', '2026-08-19', 'Not Enrolled');
INSERT INTO public.enrollment_data (enrollment_id, student_id, course_code, semester, school_year, enrollment_date, enrollment_status) OVERRIDING SYSTEM VALUE VALUES (46, '2026-0003', 2, '1st Semester', '2026-2027', '2026-10-20', 'Dropped');


--
-- Data for Name: enrollment_periods; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.enrollment_periods (period_id, school_year, semester, opens_at, closes_at, drop_deadline, is_active, updated_by, updated_at) OVERRIDING SYSTEM VALUE VALUES (1, '2025-2026', '2nd Semester', '2026-10-19 16:00:00+00', '2026-10-26 15:59:00+00', NULL, true, 'q8m.vexul.4rkn.edu@gmail.com', '2026-10-20 12:33:39.746288+00');


--
-- Data for Name: grades_data; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: lesson_progress; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.lesson_progress (student_id, lesson_id, first_opened, last_opened, completed_at) VALUES ('2026-0003', 2, '2026-10-21 00:13:22.754743+00', '2026-10-21 00:13:22.754743+00', NULL);
INSERT INTO public.lesson_progress (student_id, lesson_id, first_opened, last_opened, completed_at) VALUES ('2026-0003', 1, '2026-10-21 00:13:16.294049+00', '2026-10-24 13:54:54.075431+00', NULL);


--
-- Data for Name: lessons; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.lessons (lesson_id, subject_id, module_no, lesson_no, module_title, title, kind, minutes, summary, objectives, body_html, resources, status, reviewed, updated_at, module_id) VALUES (1, 10, 3, 1, 'Ohm''s Law and Basic Circuits', 'Ohm''s Law', 'Reading', 15, 'Relate voltage, current and resistance with V = I × R.', '{"State Ohm''s Law and the unit of each quantity","Solve for any one of V, I or R given the other two","Show known values, substitution and units in a worked solution"}', '<h3>Introduction</h3><p>Almost every circuit calculation starts with one relationship between three quantities. Knowing it lets you predict how much current a device draws or what resistor you need.</p>
<h3>Lesson discussion</h3><p>Ohm''s Law states that the voltage across a resistor is proportional to the current through it: <b>V = I × R</b>. Rearranged: <b>I = V / R</b> and <b>R = V / I</b>.</p>
<h3>Key terms</h3><ul><li><b>Voltage (V)</b>: potential difference, in volts.</li><li><b>Current (I)</b>: flow of charge, in amperes.</li><li><b>Resistance (R)</b>: opposition to current, in ohms (Ω).</li></ul>
<h3>Worked example</h3><p><b>Known:</b> V = 12 V, R = 240 Ω. <b>Unknown:</b> I.<br><b>Formula:</b> I = V / R<br><b>Substitution:</b> I = 12 V / 240 Ω<br><b>Answer:</b> I = 0.05 A = 50 mA.</p>
<h3>Practice</h3><p>A 9 V battery drives 3 mA through a resistor. On paper, find R (answer shown after the knowledge check).</p>
<h3>Summary</h3><p>V = I × R links the three basic quantities; always carry units through the calculation.</p>
<h3>Completion requirements</h3><p>Score at least 70% on the knowledge check, then press <b>Mark lesson complete</b>.</p>', '[{"url": "https://openstax.org/books/college-physics-2e/pages/20-2-ohms-law-resistance-and-simple-circuits", "title": "OpenStax College Physics 2e: Ohm''s Law, Resistance, and Simple Circuits", "source": "OpenStax (CC BY)"}]', 'published', false, '2026-10-20 13:07:10.607395+00', NULL);
INSERT INTO public.lessons (lesson_id, subject_id, module_no, lesson_no, module_title, title, kind, minutes, summary, objectives, body_html, resources, status, reviewed, updated_at, module_id) VALUES (2, 10, 3, 2, 'Ohm''s Law and Basic Circuits', 'Series and Parallel Resistors', 'Reading', 15, 'Combine resistors to find equivalent resistance.', '{"Calculate equivalent resistance of series and parallel combinations","Explain how current and voltage divide"}', '<h3>Introduction</h3><p>Real circuits combine many resistors. Replacing them with one equivalent resistor makes analysis simple.</p>
<h3>Lesson discussion</h3><p><b>Series</b> (one path): R<sub>eq</sub> = R₁ + R₂ + …, the same current flows through each. <b>Parallel</b> (shared voltage): 1/R<sub>eq</sub> = 1/R₁ + 1/R₂ + …, and currents add.</p>
<h3>Worked example</h3><p>Two 100 Ω resistors in parallel: 1/R<sub>eq</sub> = 1/100 + 1/100 = 2/100, so R<sub>eq</sub> = 50 Ω.</p>
<h3>Summary</h3><p>Series adds resistance; parallel lowers it below the smallest branch.</p>
<h3>Completion requirements</h3><p>Pass the knowledge check, then mark the lesson complete.</p>', '[{"url": "https://ocw.mit.edu/courses/6-01sc-introduction-to-electrical-engineering-and-computer-science-i-spring-2011/pages/unit-3-circuits/circuits/", "title": "MIT OCW 6.01SC: Circuits unit", "source": "MIT OpenCourseWare (CC BY-NC-SA)"}]', 'published', false, '2026-10-20 13:07:10.607395+00', NULL);
INSERT INTO public.lessons (lesson_id, subject_id, module_no, lesson_no, module_title, title, kind, minutes, summary, objectives, body_html, resources, status, reviewed, updated_at, module_id) VALUES (3, 1, 2, 1, 'Drawing Setup and Accuracy', 'Object Snap and Accurate Drawing', 'Reading', 12, 'Use OSNAP, Ortho and Polar Tracking to draw precise geometry.', '{"Explain the purpose of Object Snap","Turn on endpoint, midpoint and center snaps","Avoid the common mistake of clicking near, not on, a point"}', '<h3>Introduction</h3><p>A drawing that only looks right is not accurate. Object Snap (OSNAP) locks the cursor onto exact geometry such as endpoints.</p>
<h3>Lesson discussion</h3><p><b>Purpose:</b> pick exact points. <b>Workflow:</b> start a command (e.g. LINE), hover until the snap marker appears, then click. Toggle OSNAP with <b>F3</b>; Ortho is <b>F8</b>; Polar Tracking is <b>F10</b>.</p>
<h3>Common mistakes</h3><ul><li>Clicking without the snap marker visible.</li><li>Ortho on while drawing angled lines.</li></ul>
<h3>Practice</h3><p>Draw a 100 × 60 rectangle, then a line from the midpoint of one side to the midpoint of the opposite side using OSNAP.</p>
<h3>Completion requirements</h3><p>Pass the knowledge check, then mark the lesson complete.</p>', '[{"url": "https://help.autodesk.com/view/ACD/2026/ENU/index.html?contextId=ACD_FOUNDATIONS_LANDING", "title": "Autodesk AutoCAD Foundations", "source": "Autodesk Help"}]', 'published', false, '2026-10-20 13:07:10.607395+00', 2);


--
-- Data for Name: modules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (1, 1, 1, 'Introduction to Autocad', 'computer-aided design (CAD) software', '/modules/COE/year1/COE101_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (2, 1, 2, 'Orthographic, Isometric and Centerlines', 'constructing orthographic projections and isometric drawings', '/modules/COE/year1/COE101_module2.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (3, 1, 3, 'Dimensioning and Annotation', 'adding dimensions, text, and annotations to drawings', '/modules/COE/year1/COE101_module3.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (4, 2, 1, 'Introduction to Databases', 'database concepts, DBMS, and data models', '/modules/COE/year2/COE201_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (5, 2, 2, 'Entity-Relationship Modeling', 'entities, attributes, relationships, and ER diagrams', '/modules/COE/year2/COE201_module2.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (6, 2, 3, 'SQL Basics: DDL and DML', 'create, insert, update, delete, and select statements', '/modules/COE/year2/COE201_module3.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (7, 3, 1, 'Introduction to Electrical and Electronic Circuits', 'series and parallel dc circuits', '/modules/ELE/year1/ELE101_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (8, 3, 2, 'Ohm''s Law and Kirchhoff''s Laws', 'KCL and KVL applied to dc circuits', '/modules/ELE/year1/ELE101_module2.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (9, 4, 1, 'Network Theorems', 'superposition, source transformation, and equivalents', '/modules/ELE/year2/ELE201_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (10, 4, 2, 'Thevenin''s and Norton''s Theorems', 'finding Thevenin and Norton equivalent circuits', '/modules/ELE/year2/ELE201_module2.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (11, 7, 1, 'Number Systems and Boolean Algebra', 'binary, octal, hexadecimal, and boolean laws', '/modules/COE/year2/COE203_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (12, 7, 2, 'Logic Gates and Combinational Circuits', 'gate-level design and simplification', '/modules/COE/year2/COE203_module2.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (13, 10, 1, 'Fundamentals of Electrical Quantities', 'voltage, current, resistance, and power', '/modules/EEE/year1/EEE101_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (14, 12, 1, 'Introduction to Computing Concepts', 'hardware, software, and the history of computing', '/modules/IT/year1/IT101_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (15, 13, 1, 'HTML and CSS Fundamentals', 'page structure, semantic tags, and styling', '/modules/IT/year2/IT201_module1.pdf', '2026-10-20 01:03:16.732524', 'published');
INSERT INTO public.modules (module_id, subject_id, module_no, title, description, file_path, date_uploaded, status) OVERRIDING SYSTEM VALUE VALUES (16, 13, 2, 'JavaScript Essentials', 'variables, functions, DOM, and events', '/modules/IT/year2/IT201_module2.pdf', '2026-10-20 01:03:16.732524', 'published');


--
-- Data for Name: programs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.programs (program_id, program_code, program_name, department) OVERRIDING SYSTEM VALUE VALUES (1, 'COE', 'Computer Engineering', 'Engineering');
INSERT INTO public.programs (program_id, program_code, program_name, department) OVERRIDING SYSTEM VALUE VALUES (2, 'ELE', 'Electronics Engineering', 'Engineering');
INSERT INTO public.programs (program_id, program_code, program_name, department) OVERRIDING SYSTEM VALUE VALUES (3, 'EEE', 'Electrical Engineering', 'Engineering');
INSERT INTO public.programs (program_id, program_code, program_name, department) OVERRIDING SYSTEM VALUE VALUES (4, 'IT', 'Information Technology', 'CCS');


--
-- Data for Name: quiz_attempts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.quiz_attempts (attempt_id, student_id, lesson_id, score, total, passed, answers, taken_at) VALUES (1, '2026-0003', 1, 2, 3, false, '{"3": 0, "6": 2, "7": 0}', '2026-10-24 13:56:39.35574+00');


--
-- Data for Name: quiz_questions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (1, 2, 'Three 10 Ω resistors in series give:', '["3.3 Ω", "10 Ω", "30 Ω", "100 Ω"]', 2, 'Series resistances add.');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (2, 2, 'Parallel equivalent resistance is always…', '["larger than the largest", "smaller than the smallest", "equal to the sum", "zero"]', 1, 'Extra paths lower the total resistance.');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (3, 1, 'What is the current through a 100 Ω resistor across 5 V?', '["0.05 A", "0.5 A", "20 A", "500 A"]', 0, 'I = V/R = 5/100 = 0.05 A.');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (4, 3, 'OSNAP is used to…', '["change units", "pick exact points on geometry", "print a drawing", "create layers"]', 1, 'It locks the cursor onto exact points.');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (5, 3, 'Which key toggles Object Snap?', '["F3", "F8", "F10", "F12"]', 0, 'F3 toggles OSNAP (F8 Ortho, F10 Polar).');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (6, 1, 'Which unit measures resistance?', '["Volt", "Ampere", "Ohm", "Watt"]', 2, 'Resistance is measured in ohms (Ω).');
INSERT INTO public.quiz_questions (question_id, lesson_id, prompt, options, answer, explanation) VALUES (7, 1, 'If V doubles and R is unchanged, I…', '["halves", "doubles", "is unchanged", "becomes zero"]', 1, 'I = V/R is proportional to V.');


--
-- Data for Name: section_students; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sections; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: student_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0001', 'Mario', 'Dela Cruz', 'mariodelacruz@gmail.com', 'COE', '2nd Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0002', 'Maria', 'Santos', 'mariasantos@gmail.com', 'ELE', '1st Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0003', 'Juan', 'Reyes', 'juanreyes@gmail.com', 'EEE', '1st Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0004', 'Ana', 'Garcia', 'anagarcia@gmail.com', 'IT', '1st Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0005', 'Jose', 'Ramos', 'joseramos@gmail.com', 'COE', '2nd Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0006', 'Angela', 'Mendoza', 'angelamendoza@gmail.com', 'ELE', '2nd Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0007', 'Carlo', 'Bautista', 'carlobautista@gmail.com', 'IT', '2nd Year', 'Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0008', 'Patricia', 'Villanueva', 'patriciav@gmail.com', 'EEE', '1st Year', 'Not Enrolled');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0009', 'Miguel', 'Torres', 'migueltorres@gmail.com', 'COE', '1st Year', 'Dropped');
INSERT INTO public.student_profiles (student_id, first_name, last_name, email, program, year_level, enrollment_status) VALUES ('2026-0010', 'Sofia', 'Navarro', 'sofianavarro@gmail.com', 'IT', '1st Year', 'Enrolled');


--
-- Data for Name: subjects; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'COE101', 'Autocad', 3, '1st Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (2, 1, 'COE201', 'Database', 3, '2nd Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (3, 2, 'ELE101', 'Electric Circuits 1', 3, '1st Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (4, 2, 'ELE201', 'Electric Circuits 2', 3, '2nd Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (5, 1, 'COE102', 'Computer Programming 1', 3, '1st Year', '2nd Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (6, 1, 'COE202', 'Data Structures and Algorithms', 3, '2nd Year', '2nd Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (7, 1, 'COE203', 'Digital Logic Design', 3, '2nd Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (8, 2, 'ELE102', 'Electronics 1', 3, '1st Year', '2nd Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (9, 2, 'ELE202', 'Electronics 2', 3, '2nd Year', '2nd Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (10, 3, 'EEE101', 'Introduction to Electrical Engineering', 3, '1st Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (11, 3, 'EEE201', 'Electrical Machines', 3, '2nd Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (12, 4, 'IT101', 'Introduction to Computing', 3, '1st Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (13, 4, 'IT201', 'Web Development', 3, '2nd Year', '1st Semester');
INSERT INTO public.subjects (subject_id, program_id, subject_code, subject_name, units, year_level, semester) OVERRIDING SYSTEM VALUE VALUES (14, 4, 'IT202', 'Networking Fundamentals', 3, '2nd Year', '2nd Semester');


--
-- Data for Name: submissions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: accounts_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_account_id_seq', 9, true);


--
-- Name: announcements_announcement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.announcements_announcement_id_seq', 1, false);


--
-- Name: assignments_assignment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.assignments_assignment_id_seq', 11, true);


--
-- Name: audit_log_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_log_id_seq', 7, true);


--
-- Name: course_materials_material_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.course_materials_material_id_seq', 9, true);


--
-- Name: courses_course_code_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.courses_course_code_seq', 10, true);


--
-- Name: enrollment_data_enrollment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.enrollment_data_enrollment_id_seq', 47, true);


--
-- Name: enrollment_periods_period_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.enrollment_periods_period_id_seq', 1, true);


--
-- Name: grades_data_grade_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.grades_data_grade_id_seq', 26, true);


--
-- Name: lessons_lesson_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lessons_lesson_id_seq', 3, true);


--
-- Name: modules_module_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.modules_module_id_seq', 16, true);


--
-- Name: programs_program_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.programs_program_id_seq', 4, true);


--
-- Name: quiz_attempts_attempt_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quiz_attempts_attempt_id_seq', 1, true);


--
-- Name: quiz_questions_question_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quiz_questions_question_id_seq', 7, true);


--
-- Name: sections_section_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sections_section_id_seq', 1, false);


--
-- Name: subjects_subject_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.subjects_subject_id_seq', 14, true);


--
-- Name: submissions_submission_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.submissions_submission_id_seq', 1, false);


--
-- Name: accounts accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_email_key UNIQUE (email);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (account_id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (announcement_id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (log_id);


--
-- Name: authorized_users authorized_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorized_users
    ADD CONSTRAINT authorized_users_pkey PRIMARY KEY (email);


--
-- Name: course_materials course_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_pkey PRIMARY KEY (material_id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (course_code);


--
-- Name: enrollment_data enrollment_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_data
    ADD CONSTRAINT enrollment_data_pkey PRIMARY KEY (enrollment_id);


--
-- Name: enrollment_periods enrollment_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_periods
    ADD CONSTRAINT enrollment_periods_pkey PRIMARY KEY (period_id);


--
-- Name: enrollment_periods ep_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_periods
    ADD CONSTRAINT ep_unique UNIQUE (school_year, semester);


--
-- Name: grades_data grades_data_enrollment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades_data
    ADD CONSTRAINT grades_data_enrollment_id_key UNIQUE (enrollment_id);


--
-- Name: grades_data grades_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades_data
    ADD CONSTRAINT grades_data_pkey PRIMARY KEY (grade_id);


--
-- Name: lesson_progress lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY (student_id, lesson_id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (lesson_id);


--
-- Name: lessons lessons_subject_id_module_no_lesson_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_subject_id_module_no_lesson_no_key UNIQUE (subject_id, module_no, lesson_no);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (module_id);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (program_id);


--
-- Name: programs programs_program_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_program_code_key UNIQUE (program_code);


--
-- Name: quiz_attempts quiz_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_pkey PRIMARY KEY (attempt_id);


--
-- Name: quiz_questions quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_pkey PRIMARY KEY (question_id);


--
-- Name: section_students section_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_pkey PRIMARY KEY (section_id, student_id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (section_id);


--
-- Name: student_profiles student_profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_email_key UNIQUE (email);


--
-- Name: student_profiles student_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_profiles
    ADD CONSTRAINT student_profiles_pkey PRIMARY KEY (student_id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (subject_id);


--
-- Name: submissions submissions_assignment_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (submission_id);


--
-- Name: enrollment_data uq_enrollment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_data
    ADD CONSTRAINT uq_enrollment UNIQUE (student_id, course_code, semester, school_year);


--
-- Name: modules uq_module_no; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT uq_module_no UNIQUE (subject_id, module_no);


--
-- Name: subjects uq_subject; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT uq_subject UNIQUE (program_id, subject_code);


--
-- Name: courses_one_main; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX courses_one_main ON public.courses USING btree ((true)) WHERE is_main;


--
-- Name: enrollment_one_per_term; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX enrollment_one_per_term ON public.enrollment_data USING btree (student_id, course_code, school_year);


--
-- Name: quiz_attempts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quiz_attempts_idx ON public.quiz_attempts USING btree (student_id, lesson_id);


--
-- Name: uq_accounts_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_accounts_student_id ON public.accounts USING btree (student_id) WHERE (student_id IS NOT NULL);


--
-- Name: uq_student_profiles_student_id_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_student_profiles_student_id_ci ON public.student_profiles USING btree (upper((student_id)::text));


--
-- Name: accounts accounts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(student_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assignments assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id);


--
-- Name: course_materials course_materials_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code);


--
-- Name: courses courses_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id);


--
-- Name: enrollment_data enrollment_data_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_data
    ADD CONSTRAINT enrollment_data_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code);


--
-- Name: enrollment_data enrollment_data_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_data
    ADD CONSTRAINT enrollment_data_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(student_id) ON UPDATE CASCADE;


--
-- Name: grades_data grades_data_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades_data
    ADD CONSTRAINT grades_data_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollment_data(enrollment_id);


--
-- Name: lesson_progress lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(lesson_id);


--
-- Name: lessons lessons_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.modules(module_id) ON DELETE SET NULL;


--
-- Name: lessons lessons_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id);


--
-- Name: modules modules_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(subject_id);


--
-- Name: quiz_attempts quiz_attempts_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(lesson_id);


--
-- Name: quiz_questions quiz_questions_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(lesson_id) ON DELETE CASCADE;


--
-- Name: section_students section_students_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(section_id) ON DELETE CASCADE;


--
-- Name: section_students section_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(student_id) ON DELETE CASCADE;


--
-- Name: sections sections_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE CASCADE;


--
-- Name: subjects subjects_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(program_id);


--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(assignment_id) ON DELETE CASCADE;


--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.student_profiles(student_id) ON DELETE CASCADE;


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements read published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcements read published" ON public.announcements FOR SELECT USING (published);


--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: authorized_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

--
-- Name: course_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.assignments FOR SELECT USING (true);


--
-- Name: courses demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.courses FOR SELECT USING (true);


--
-- Name: enrollment_data demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.enrollment_data FOR SELECT USING (true);


--
-- Name: grades_data demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.grades_data FOR SELECT USING (true);


--
-- Name: modules demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.modules FOR SELECT USING (true);


--
-- Name: programs demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.programs FOR SELECT USING (true);


--
-- Name: student_profiles demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.student_profiles FOR SELECT USING (true);


--
-- Name: subjects demo read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "demo read" ON public.subjects FOR SELECT USING (true);


--
-- Name: enrollment_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_data ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enrollment_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment_periods ep_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_read ON public.enrollment_periods FOR SELECT USING (true);


--
-- Name: grades_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grades_data ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

--
-- Name: programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

--
-- Name: quiz_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: quiz_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: section_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.section_students ENABLE ROW LEVEL SECURITY;

--
-- Name: sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

--
-- Name: student_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict wGXETTyXxRWqJQtNeUWL5rc93CjhXE5dvjiPwuQwLighC5Jxmgazg7oZONphVb2

