"use client";

import {
  Check,
  Clock3,
  Folder,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  createProjectAction,
  createTimelineAction,
  createWishAction,
  deleteProjectAction,
  deleteTimelineAction,
  deleteWishAction,
  toggleProjectAction,
  toggleWishAction,
} from "@/app/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import type { DashboardData } from "@/lib/types";

function RowActions({
  done,
  onToggle,
  onDelete,
}: {
  done: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions collection-actions">
      <button className="icon-button" aria-label={done ? "恢复" : "完成"} onClick={onToggle}>{done ? <RotateCcw size={15} /> : <Check size={16} />}</button>
      <button className="icon-button danger" aria-label="删除" onClick={onDelete}><Trash2 size={15} /></button>
    </div>
  );
}

export function ProjectsCard({ projects }: { projects: DashboardData["projects"] }) {
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [name, setName] = useState("");
  const mutation = useMutation();
  const active = projects.filter((item) => item.status === "active");
  return (
    <>
      <Card>
        <CardHeader icon={Folder} title="我的项目" action={<button className="text-button" onClick={() => setOpen(true)}><Plus size={15} />新建项目</button>} />
        <div className="collection-list">
          {active.slice(0, 3).map((item) => <div className="collection-row" key={item.id}><span>{item.name}</span><em>进行中</em></div>)}
          {active.length === 0 ? <p className="empty-line">还没有进行中的项目</p> : null}
        </div>
        <button className="view-all" onClick={() => setAllOpen(true)}>查看全部项目 <span>›</span></button>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="新建项目" description="项目第一版只需要一个名字。" size="small">
        <label className="field-label"><span>项目名称</span><input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!name.trim() || mutation.pending} onClick={async () => { const result = await mutation.run(() => createProjectAction(name)); if (result.ok) { setName(""); setOpen(false); } }}>创建</button></div>
      </Modal>
      <Modal open={allOpen} onClose={() => setAllOpen(false)} title="全部项目" size="medium">
        <div className="management-list">{projects.length === 0 ? <p className="empty-line">还没有项目</p> : projects.map((item) => <div className={item.status === "completed" ? "management-row completed" : "management-row"} key={item.id}><div><strong>{item.name}</strong><span>{item.status === "active" ? "进行中" : "已完成"}</span></div><RowActions done={item.status === "completed"} onToggle={() => mutation.run(() => toggleProjectAction(item.id))} onDelete={() => { if (window.confirm("删除这个项目？")) mutation.run(() => deleteProjectAction(item.id)); }} /></div>)}</div>
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}

export function WishesCard({ wishes }: { wishes: DashboardData["wishes"] }) {
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [title, setTitle] = useState("");
  const mutation = useMutation();
  const active = wishes.filter((item) => item.status === "active");
  return (
    <>
      <Card>
        <CardHeader icon={Star} title="愿望池" action={<button className="text-button" onClick={() => setOpen(true)}><Plus size={15} />添加愿望</button>} />
        <div className="collection-list simple">{active.slice(0, 4).map((item) => <div className="collection-row" key={item.id}><span>{item.title}</span></div>)}{active.length === 0 ? <p className="empty-line">愿望池还空着</p> : null}</div>
        <button className="view-all" onClick={() => setAllOpen(true)}>查看全部愿望 <span>›</span></button>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="添加愿望" description="不用给愿望设进度和期限。" size="small">
        <label className="field-label"><span>愿望内容</span><input autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!title.trim() || mutation.pending} onClick={async () => { const result = await mutation.run(() => createWishAction(title)); if (result.ok) { setTitle(""); setOpen(false); } }}>添加</button></div>
      </Modal>
      <Modal open={allOpen} onClose={() => setAllOpen(false)} title="全部愿望" size="medium">
        <div className="management-list">{wishes.length === 0 ? <p className="empty-line">还没有愿望</p> : wishes.map((item) => <div className={item.status === "fulfilled" ? "management-row completed" : "management-row"} key={item.id}><div><strong>{item.title}</strong><span>{item.status === "active" ? "未实现" : "已实现"}</span></div><RowActions done={item.status === "fulfilled"} onToggle={() => mutation.run(() => toggleWishAction(item.id))} onDelete={() => { if (window.confirm("删除这个愿望？")) mutation.run(() => deleteWishAction(item.id)); }} /></div>)}</div>
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}

export function TimelinesCard({ timelines }: { timelines: DashboardData["timelines"] }) {
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [ongoing, setOngoing] = useState(true);
  const [endDate, setEndDate] = useState("");
  const mutation = useMutation();
  return (
    <>
      <Card>
        <CardHeader icon={Clock3} title="人生时间线" action={<button className="text-button" onClick={() => setOpen(true)}><Plus size={15} />新建</button>} />
        <div className="timeline-list">{timelines.slice(0, 3).map((item) => <div className="timeline-row" key={item.id}><div><span>{item.name}</span>{item.progress !== null ? <div className="progress-track"><i style={{ width: `${item.progress}%` }} /></div> : null}</div><em>{item.display}</em></div>)}{timelines.length === 0 ? <p className="empty-line">还没有人生时间线</p> : null}</div>
        <button className="view-all" onClick={() => setAllOpen(true)}>查看全部时间线 <span>›</span></button>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="新建人生时间线" size="small">
        <div className="form-stack"><label className="field-label"><span>名称</span><input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field-label"><span>开始日期</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label className="toggle-line"><input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} /><span>仍在继续</span></label>{!ongoing ? <label className="field-label"><span>结束日期</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label> : null}</div>
        <InlineFeedback error={mutation.error} />
        <div className="modal-actions"><button className="secondary-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={!name.trim() || !startDate || (!ongoing && !endDate) || mutation.pending} onClick={async () => { const result = await mutation.run(() => createTimelineAction({ name, startDate, endDate: ongoing ? null : endDate })); if (result.ok) { setName(""); setStartDate(""); setEndDate(""); setOngoing(true); setOpen(false); } }}>创建</button></div>
      </Modal>
      <Modal open={allOpen} onClose={() => setAllOpen(false)} title="全部人生时间线" size="medium">
        <div className="management-list">{timelines.length === 0 ? <p className="empty-line">还没有时间线</p> : timelines.map((item) => <div className="management-row" key={item.id}><div><strong>{item.name}</strong><span>{item.startDate} → {item.endDate ?? "至今"} · {item.display}</span></div><button className="icon-button danger" onClick={() => { if (window.confirm("删除这条时间线？")) mutation.run(() => deleteTimelineAction(item.id)); }}><Trash2 size={15} /></button></div>)}</div>
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}

