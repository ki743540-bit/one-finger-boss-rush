import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const artDirection = `

## アートディレクターによるビジュアル品質ゲート
構文が動くことと、見た目・ゲーム体験が魅力的なことを別々に評価する。空白の背景に数個の図形を置いただけ、得点数字だけ変化する作品は完成品と認めない。
- 場面に明確な奥行き・前景/中景/背景を持たせ、画面の中央に主要アクションと視覚的な焦点を作る。ステージがほぼ単色の空白という設計は禁止。暗い背景がテーマに適合する場合は例外だが、ゲームの空間を示す環境表現は必須。
- ユーザーのジャンルを具体化する。スポーツなら床・競技線・道具・会場を、レースなら道路・背景・速度感を、格闘ならステージ・敵・攻撃エフェクトを描く。装飾は操作・当たり判定を邪魔しない。
- ボタン、チュートリアル、成功・失敗・コンボ・得点・時間切れを自然な日本語で表す。ハイライト、影、質感、動き、軽いパーティクル等を端末性能の範囲で使用する。
- バスケットボールゲームは少なくとも (1) コート床・ラインと体育館/観客席などの空間 (2) 支柱・バックボード・リング・ネット (3) 表面模様と立体感のあるボール (4) 指のドラッグによる照準と発射 (5) ボールの飛翔・リング到達・成功失敗演出 (6) 残り時間・得点・再挑戦、を一貫した構図で実装する。シュート中にボールが画面外へ飛びっぱなしにならず、復帰できること。リングとの位置関係を数値で検証する。
- 画面画像を実際に確認できていないのに「視覚検証済み」とは主張しない。ソースで説明できない美観判断は推測と明記する。
`;

export const plannerExtension = '【画面演出の仕様】ゲームのジャンルに応じて背景/中景/前景、ステージ構成物、プレイヤーの主要操作、得点/失敗の演出を具体的に列挙する。画面中央にゲームが集中して周囲が真っ暗な空白になる設計は避ける。バスケならコート床とライン、リング一式、ボールの立体感、シュート軌跡、体育館背景、成功演出を明示。';
export const layoutExtension = '【重要：ビジュアル審査】背景が単色・空白のまま、競技場や主要ステージの構成物が欠落、物体が不自然に離れすぎる、画面の大部分がプレイに無関係、背景/中景/前景の関係がない、スマホ縦画面で見せ場が小さい、演出が得点テキストだけ、のいずれかがソースから確認できれば severity:high の問題としてJSONで報告。バスケのリングとボールだけ・コートがない作品を安易に合格させない。ただしコード片だけで描画の有無が判断できない場合は断定せず、証拠を挙げて検査範囲の限界を明記する。';
export const physicsExtension = '【バスケの重点検査】発射位置/速度/重力/リングの高さ/半径を比較し、実際に到達可能な放物線であるか、下降中のゴールだけ加点か、外れた場合に再発射できるか、時間の初期値と表示が一致するか、タップ連打で得点が無限加算されないか検査する。';
export const engineerExtension = '【映像品質の完成条件】大きな空白+ボール+リング+得点だけの試作品は禁止。スポーツのステージ、視覚的奥行き、操作ガイド、球の動きと効果、得点フィードバックまで制作する。完成より質の高い短いゲームを選択。';

export function enhanceTeamSource(src) {
 let out=src;
 const addRole=(role,extra)=>{
  const begin=`const ${role}=\``;
  const i=out.indexOf(begin);
  if(i<0) throw new Error(`役割プロンプトが見つかりません: ${role}`);
  const j=out.indexOf('`;',i+begin.length);
  if(j<0) throw new Error(`役割プロンプトが閉じていません: ${role}`);
  if(out.slice(i,j).includes(extra))return;
  out=out.slice(0,j)+'\\n'+extra+out.slice(j);
 };
 addRole('plannerRole',plannerExtension);
 addRole('layoutRole',layoutExtension);
 addRole('physicsRole',physicsExtension);
 const prefix='【製作ライン】開始／プレイ／終了／再挑戦';
 if(!out.includes(prefix))throw new Error('実装者プロンプトが見つかりません');
 if(!out.includes(engineerExtension))out=out.replace(prefix,engineerExtension+'\\n\\n'+prefix);
 return out;
}

export function installVisualUpgrade(root){
 const p=join(root,'prompts/game-developer.md');
 let prompt=readFileSync(p,'utf8');
 if(!prompt.includes('## アートディレクターによるビジュアル品質ゲート'))prompt+=artDirection;
 writeFileSync(p,prompt);
 const t=join(root,'lib/team.mjs');
 const team=readFileSync(t,'utf8');
 writeFileSync(t,enhanceTeamSource(team));
}

if(process.argv[1]?.endsWith('visual-v5.mjs') && process.argv[2]) installVisualUpgrade(process.argv[2]);