import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Users, Calendar, AlertCircle } from 'lucide-react';
import api from '../services/api';

const CompanyProfile = ({ stockId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!stockId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/twinkle/company/${stockId}`);
        if (res.data?.result) {
          setData(res.data.result);
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
  );
};

export default CompanyProfile;
