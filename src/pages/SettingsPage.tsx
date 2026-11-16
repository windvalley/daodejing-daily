import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { PageHeader, Segmented, Toggle } from '../components/common'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAppData } from '../hooks/useAppData'
import { formatDateTime } from '../lib/date'
import { getStats } from '../lib/stats'
import { useSpeech } from '../hooks/useSpeech'
import { actions, exportData, parseImport, type SpeechVoice, type ThemeMode } from '../lib/store'

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const voiceOptions: { value: SpeechVoice; label: string }[] = [
  { value: 'male', label: '男声' },
  { value: 'female', label: '女声' },
]

/** 试听用的短句，含多音字，顺便能听出读音校正是否生效 */
const VOICE_SAMPLE = '道可道，非常道。上善若水，水善利万物而不争。'

export function SettingsPage() {
  usePageTitle('我的')
  const data = useAppData()
  const toast = useToast()
  const stats = getStats(data)
  const fileRef = useRef<HTMLInputElement>(null)
  const speech = useSpeech()
  const [pending, setPending] = useState<ReturnType<typeof parseImport> | null>(null)

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `道德经学习备份-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast('备份已导出')
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setPending(parseImport(text))
  }

  const confirmImport = () => {
    if (!pending?.ok) return
    actions.replaceAll(pending.data)
    setPending(null)
    if (fileRef.current) fileRef.current.value = ''
    toast('数据已导入')
  }

  const progress = Math.round((stats.read / stats.total) * 100)

  return (
    <div className="page settings-page">
      <PageHeader eyebrow="我的" title="设置与数据" description="所有数据都保存在这台设备的浏览器里，不上传服务器。" />

      <div className="settings-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>阅读外观</h2>
          </div>
          <div className="setting-block">
            <span className="field-label">主题</span>
            <Segmented
              options={themeOptions}
              value={data.settings.theme}
              onChange={(theme) => actions.updateSettings({ theme })}
              ariaLabel="选择主题"
            />
          </div>
          <div className="setting-block">
            <label className="field-label" htmlFor="font-size">
              正文字号
              <span className="field-value">{data.settings.fontSize}px</span>
            </label>
            <input
              id="font-size"
              type="range"
              min={15}
              max={24}
              step={1}
              value={data.settings.fontSize}
              onChange={(event) => actions.updateSettings({ fontSize: Number(event.target.value) })}
            />
            <p className="setting-sample">道可道，非常道；名可名，非常名。</p>
          </div>
          <Toggle
            checked={data.settings.serif}
            onChange={(serif) => actions.updateSettings({ serif })}
            label="原文使用宋体"
            description="开启后原文更接近纸书观感，关闭则使用界面字体。"
          />
          <Toggle
            checked={data.settings.showTranslation}
            onChange={(showTranslation) => actions.updateSettings({ showTranslation })}
            label="章页默认展开译文"
            description="关闭后进入章页先只看原文，需要时再展开。"
          />
          <Toggle
            checked={data.settings.showPinyin}
            onChange={(showPinyin) => actions.updateSettings({ showPinyin })}
            label="原文显示注音"
            description="已收录注音的章节会在原文上方标注拼音，关闭后只看原文，章页也能随时切换。"
          />
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>学习与复习</h2>
          </div>
          <div className="setting-block">
            <label className="field-label" htmlFor="goal">
              每日复习目标
              <span className="field-value">{data.settings.dailyReviewGoal} 章</span>
            </label>
            <input
              id="goal"
              type="range"
              min={1}
              max={30}
              step={1}
              value={data.settings.dailyReviewGoal}
              onChange={(event) => actions.updateSettings({ dailyReviewGoal: Number(event.target.value) })}
            />
          </div>
          <div className="setting-block">
            <label className="field-label" htmlFor="rate">
              朗读语速
              <span className="field-value">{data.settings.speechRate.toFixed(1)}×</span>
            </label>
            <input
              id="rate"
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={data.settings.speechRate}
              onChange={(event) => actions.updateSettings({ speechRate: Number(event.target.value) })}
            />
          </div>
          <div className="setting-block">
            <label className="field-label" htmlFor="voice">
              朗读音色
            </label>
            <Segmented
              options={voiceOptions}
              value={data.settings.speechVoice}
              onChange={(speechVoice) => actions.updateSettings({ speechVoice })}
              ariaLabel="选择朗读音色"
            />
            <div className="voice-preview">
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  if (speech.speaking) {
                    speech.stop()
                    return
                  }
                  speech.speak(VOICE_SAMPLE, data.settings.speechRate, data.settings.speechVoice)
                }}
                disabled={!speech.supported}
                title={speech.supported ? '试听当前音色' : '当前浏览器不支持朗读'}
              >
                <Icon name={speech.speaking ? 'stop' : 'volume'} size={15} />
                {speech.speaking ? '停止' : '试听'}
              </button>
              <span className="muted-text">
                {speech.supported
                  ? '系统音色不分男女，这里按实测音高分成低音与高音。'
                  : '当前环境不支持朗读，音色设置不会生效。'}
              </span>
            </div>
          </div>
          <div className="mini-stats">
            <div>
              <strong>{progress}%</strong>
              <span>全篇已读</span>
            </div>
            <div>
              <strong>{stats.streak}</strong>
              <span>连续天数</span>
            </div>
            <div>
              <strong>{stats.due}</strong>
              <span>待复习</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>数据备份</h2>
            <span className="muted-text">换设备时用得上</span>
          </div>
          <p className="setting-copy">
            导出会得到一份 JSON 文件，包含阅读进度、背诵成绩、复习安排、践行笔记与设置。导入会覆盖当前设备上的全部数据。
          </p>
          <div className="row gap-sm wrap">
            <button type="button" className="button" onClick={download}>
              <Icon name="download" size={16} />
              导出备份
            </button>
            <button type="button" className="button" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} />
              导入备份
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </div>
          {pending ? (
            <div className={pending.ok ? 'import-preview is-ok' : 'import-preview is-error'}>
              {pending.ok ? (
                <>
                  <p>
                    {`备份可读：已读 ${
                      Object.values(pending.data.progress).filter((item) => item.read).length
                    } 章，背诵记录 ${Object.keys(pending.data.recite).length} 章，践行笔记 ${
                      Object.keys(pending.data.practice).length
                    } 条。`}
                  </p>
                  <div className="row gap-sm">
                    <button type="button" className="button button-small button-primary" onClick={confirmImport}>
                      确认覆盖导入
                    </button>
                    <button
                      type="button"
                      className="button button-small button-ghost"
                      onClick={() => {
                        setPending(null)
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                    >
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <p>{pending.error}</p>
              )}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>关于</h2>
          </div>
          <dl className="about-list">
            <div>
              <dt>底本</dt>
              <dd>王弼注《老子道德经》，参校河上公章句</dd>
            </div>
            <div>
              <dt>篇章</dt>
              <dd>道经三十七章，德经四十四章，共八十一章</dd>
            </div>
            <div>
              <dt>数据</dt>
              <dd>仅存本机浏览器，可导出备份，不会自动同步</dd>
            </div>
            <div>
              <dt>离线</dt>
              <dd>安装到桌面后可离线阅读与背诵</dd>
            </div>
            <div>
              <dt>开始使用</dt>
              <dd>{formatDateTime(data.createdAt)}</dd>
            </div>
          </dl>
          <p className="about-note">
            本站用于个人学习。译文与注释为便于理解的白话整理，不同注家理解有别，遇到分歧处建议回看原文。
          </p>
        </section>

        <section className="panel danger-panel">
          <div className="section-heading">
            <h2>清除数据</h2>
          </div>
          <p className="setting-copy">这会删除阅读进度、背诵记录、复习安排与践行笔记，操作不可撤销。建议先导出备份。</p>
          <div className="row gap-sm wrap">
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                if (window.confirm('确定清除全部学习数据吗？这一操作不可撤销。')) {
                  actions.resetLearningData()
                  toast('学习数据已清除')
                }
              }}
            >
              <Icon name="trash" size={16} />
              清除学习数据
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                actions.resetSettings()
                toast('外观设置已恢复默认')
              }}
            >
              恢复默认设置
            </button>
          </div>
          <p className="about-note">
            还想看全篇？<Link to="/chapters">从这里开始</Link>。
          </p>
        </section>
      </div>
    </div>
  )
}
