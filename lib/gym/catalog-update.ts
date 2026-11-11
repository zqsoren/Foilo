import images from "./media.20261112.json";

// Existing IDs stay in place because plan items and workout records refer to them.
const mediaId = (exerciseId: number) => 1000 + exerciseId;
export const gymCatalogUpdate = {
  version: 9,
  name: "gym_catalog_cards_and_illustrations",
  sql: `
    ${images.map(({ exerciseId, bytes }) =>
      `INSERT INTO gym_media (id,mime,content,artist,source,license)
       VALUES (${mediaId(exerciseId)},'image/webp',X'${Buffer.from(bytes, "base64").toString("hex")}','在侧 Folio','generated:folio','AI 生成示意图');`
    ).join("\n")}
    INSERT INTO gym_exercises (id,name,region,muscles,equipment,mode,aliases) VALUES
      (101,'单侧蝴蝶机反向飞鸟','肩','后束','固定器械','sides','单臂反向蝴蝶机飞鸟 单侧反向飞鸟'),
      (102,'反向山羊挺身','核心','腹直肌','罗马椅','body','罗马椅反向挺身 罗马椅仰卧起身'),
      (103,'宽握拉杆坐姿划船','背','背阔肌 菱形肌 中斜方肌','绳索','load','拉杆坐姿划船（宽握） 拉杆坐姿划船(宽握) 宽握坐姿划船'),
      (104,'弹力带单臂斜上推','肩','前束 肱三头肌','弹力带','sides','弹力带-侧拉 弹力带侧拉 单手斜上推'),
      (105,'史密斯臀推','臀','臀大肌','史密斯','load','史密斯臀冲 史密斯臀桥'),
      (106,'哑铃硬拉','全身','臀大肌 腘绳肌 竖脊肌','哑铃','pair','传统哑铃硬拉 双哑铃硬拉');
    UPDATE gym_exercises SET aliases=trim(aliases || ' 宽距下拉 宽距高位下拉') WHERE id=15;
    UPDATE gym_exercises SET aliases=trim(aliases || ' 窄握把手下拉 V把下拉') WHERE id=16;
    UPDATE gym_exercises SET aliases=trim(aliases || ' 引体向上（辅助） 引体向上(辅助) 辅助引体向上') WHERE id=20;
    UPDATE gym_exercises SET aliases=trim(aliases || ' 坐姿髋内收 坐姿夹腿') WHERE id=71;
    ${images.map(({ exerciseId }) =>
      `UPDATE gym_exercises SET image_id=${mediaId(exerciseId)} WHERE id=${exerciseId};`
    ).join("\n")}
  `,
} as const;
