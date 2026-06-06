import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Users, Calendar, AlertCircle, Briefcase, FileText, Gavel, Loader2, Link } from 'lucide-react';
import api from '../services/api';

const CompanyProfile = ({ stockId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const [loadingExtra, setLoadingExtra] = useState(false);
  const [executives, setExecutives] = useState(null);
  const [branches, setBranches] = useState(null);
  const [tenders, setTenders] = useState(null);
  const [judgments, setJudgments] = useState(null);

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!stockId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/twinkle/company/${stockId}`);
        if (res.data?.result) {
          setData(res.data.result);
          fetchExtraData(res.data.result.tax_id, res.data.result.company_name);
        } else {
          setError('獲取資料失敗，回傳格式異常');
        }
      } catch (err) {
        setError('取得公司基本資料時發生錯誤：' + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [stockId]);

  const parseTwinkleResult = (res) => {
    if (res.status === 'fulfilled' && res.value?.data?.result) {
      const raw = res.value.data.result;
      if (Array.isArray(raw) && raw.length > 0 && raw[0].text) {
        try {
          return JSON.parse(raw[0].text);
        } catch(e) { return null; }
      }
    }
    return null;
  };

  const fetchExtraData = async (taxId, companyName) => {
    setLoadingExtra(true);
    try {
      const shortName = companyName.replace(/股份有限公司|有限公司/g, '');
      
      const execP = api.post('/api/twinkle/call', { tool_name: 'twtools-lookup_company_executives', arguments: { tax_id: taxId } });
      const branchP = api.post('/api/twinkle/call', { tool_name: 'twtools-lookup_company_branches', arguments: { tax_id: taxId } });
      const tenderP = api.post('/api/twinkle/call', { tool_name: 'opendata-query_rows', arguments: { dataset_id: 'pcc-tender', where: `announcement_type='決標公告' AND companies ILIKE '%${shortName}%'`, limit: 5, order_by: 'date DESC' } });
      const judP = api.post('/api/twinkle/call', { tool_name: 'opendata-query_rows', arguments: { dataset_id: 'jud-rulings', where: `parties ILIKE '%${shortName}%'`, limit: 5, order_by: 'jdate_iso DESC' } });
      
      const [execRes, branchRes, tenderRes, judRes] = await Promise.allSettled([execP, branchP, tenderP, judP]);
      
      const execData = parseTwinkleResult(execRes);
      if (execData?.found) setExecutives(execData.executives || []);
      
      const branchData = parseTwinkleResult(branchRes);
      if (branchData?.found) setBranches(branchData.branches || []);

      const tenderData = parseTwinkleResult(tenderRes);
      if (tenderData?.rows && tenderData.columns) {
        const cols = tenderData.columns;
        setTenders(tenderData.rows.map(row => {
          let obj = {};
          cols.forEach((c, i) => obj[c] = row[i]);
          return obj;
        }));
      }

      const judData = parseTwinkleResult(judRes);
      if (judData?.rows && judData.columns) {
        const cols = judData.columns;
        setJudgments(judData.rows.map(row => {
          let obj = {};
          cols.forEach((c, i) => obj[c] = row[i]);
          return obj;
        }));
      }

    } catch (e) {
      console.error('Error fetching extra data:', e);
    } finally {
      setLoadingExtra(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl flex items-center space-x-3">
        <AlertCircle size={20} />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* 核心公司資料 */}
      <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <Building2 size={24} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-200">{data.company_name}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-sm text-gray-400 font-mono">統編: {data.tax_id}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${data.status === '核准設立' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-700 text-gray-300'}`}>
                {data.status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
            <div className="flex items-center text-gray-400 text-sm mb-1">
              <Users size={16} className="mr-2" />
              負責人
            </div>
            <div className="text-lg font-semibold text-gray-200">{data.responsible_name || '無資料'}</div>
          </div>
          <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
            <div className="flex items-center text-gray-400 text-sm mb-1">
              <Building2 size={16} className="mr-2" />
              資本額
            </div>
            <div className="text-lg font-semibold text-gray-200">
              {data.capital_amount ? `NT$ ${(data.capital_amount).toLocaleString()}` : '無資料'}
            </div>
          </div>
          <div className="md:col-span-2 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
            <div className="flex items-center text-gray-400 text-sm mb-1">
              <MapPin size={16} className="mr-2" />
              登記地址
            </div>
            <div className="text-lg text-gray-200">{data.address || '無資料'}</div>
          </div>
        </div>
      </div>

      {loadingExtra && (
        <div className="flex items-center justify-center space-x-3 text-indigo-400 py-4 animate-pulse">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">正在從政府開放資料庫調閱深度資訊...</span>
        </div>
      )}

      {/* 董監事名單 */}
      {executives && executives.length > 0 && (
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-3 mb-4">
            <Users size={20} className="text-blue-400" />
            <h3 className="text-lg font-bold text-gray-200">董監事名單</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs text-gray-400 bg-gray-900/50 border-b border-gray-700">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">職稱</th>
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">所代表法人</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">持股數</th>
                </tr>
              </thead>
              <tbody>
                {executives.map((exec, idx) => (
                  <tr key={idx} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                    <td className="px-4 py-3 font-medium text-blue-300">{exec.title}</td>
                    <td className="px-4 py-3">{exec.name}</td>
                    <td className="px-4 py-3 text-gray-400">{exec.represents_company || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{exec.shares ? exec.shares.toLocaleString() : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 近期得標案件 */}
      {tenders && tenders.length > 0 && (
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-3 mb-4">
            <Briefcase size={20} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-gray-200">近期得標政府採購案</h3>
          </div>
          <div className="space-y-3">
            {tenders.map((tender, idx) => (
              <div key={idx} className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 hover:border-emerald-500/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-gray-200 font-semibold">{tender.title || tender.subject || '標案名稱未提供'}</div>
                  <div className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">
                    NT$ {Number(tender.award_price || 0).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center text-xs text-gray-400 space-x-4">
                  <span>機關: {tender.agency}</span>
                  <span>決標日: {tender.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 近期法院判決 */}
      {judgments && judgments.length > 0 && (
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-3 mb-4">
            <Gavel size={20} className="text-rose-400" />
            <h3 className="text-lg font-bold text-gray-200">近期法院裁判書</h3>
            <span className="text-xs text-gray-500 ml-2">※包含身分為原告/被告/關係人等</span>
          </div>
          <div className="space-y-3">
            {judgments.map((jud, idx) => (
              <div key={idx} className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 hover:border-rose-500/30 transition-colors">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">{jud.court_level_label}</span>
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">{jud.case_type}</span>
                  <span className="text-xs font-mono text-gray-400">{jud.jdate_iso}</span>
                </div>
                <div className="text-gray-200 font-semibold mb-1">{jud.case_no}</div>
                <div className="text-sm text-gray-400 line-clamp-2">{jud.issue || jud.key_reasoning || '無摘要'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分公司 */}
      {branches && branches.length > 0 && (
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <MapPin size={20} className="text-orange-400" />
              <h3 className="text-lg font-bold text-gray-200">分公司據點</h3>
            </div>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full">
              共 {branches.length} 家
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {branches.slice(0, 6).map((branch, idx) => (
              <div key={idx} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 text-sm">
                <div className="text-gray-200 font-semibold mb-1">{branch.branch_name}</div>
                <div className="text-gray-400 text-xs">{branch.address}</div>
              </div>
            ))}
          </div>
          {branches.length > 6 && (
            <div className="mt-3 text-center text-xs text-gray-500">
              還有 {branches.length - 6} 家分公司未顯示...
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default CompanyProfile;
