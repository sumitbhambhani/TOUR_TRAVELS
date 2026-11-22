import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Space, message, Tabs, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import apiClient from '../../lib/apiClient';
import { endpoints } from '../../constant/ENDPOINTS';

const { Option } = Select;

const PricingConfig = () => {
    const [activeTab, setActiveTab] = useState('hotels');
    const [hotels, setHotels] = useState([]);
    const [cars, setCars] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [isHotelModalVisible, setIsHotelModalVisible] = useState(false);
    const [isCarModalVisible, setIsCarModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    
    const [hotelForm] = Form.useForm();
    const [carForm] = Form.useForm();

    const fetchHotels = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get(endpoints.GET_HOTEL_PRICING_CONFIGS);
            setHotels(res.data?.results || res.data?.data || res.data || []);
        } catch (error) {
            message.error('Failed to load hotel pricing configs');
        } finally {
            setLoading(false);
        }
    };

    const fetchCars = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get(endpoints.GET_CAR_PRICING_CONFIGS);
            setCars(res.data?.results || res.data?.data || res.data || []);
        } catch (error) {
            message.error('Failed to load car pricing configs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'hotels') {
            fetchHotels();
        } else {
            fetchCars();
        }
    }, [activeTab]);

    // Handlers for Hotels
    const showHotelModal = (item = null) => {
        setEditingItem(item);
        if (item) {
            hotelForm.setFieldsValue(item);
        } else {
            hotelForm.resetFields();
            hotelForm.setFieldsValue({ is_active: true, room_type: 'Doublesharing' });
        }
        setIsHotelModalVisible(true);
    };

    const handleHotelSubmit = async () => {
        try {
            const values = await hotelForm.validateFields();
            if (editingItem) {
                await apiClient.put(endpoints.UPDATE_HOTEL_PRICING_CONFIG(editingItem.id), values);
                message.success('Hotel config updated successfully');
            } else {
                await apiClient.post(endpoints.CREATE_HOTEL_PRICING_CONFIG, values);
                message.success('Hotel config created successfully');
            }
            setIsHotelModalVisible(false);
            fetchHotels();
        } catch (error) {
            if (error.response?.data) {
                const errorMsg = Object.values(error.response.data).flat().join(', ');
                message.error(`Failed to save: ${errorMsg}`);
            } else if (error.errorFields) {
                // Form validation error
                return;
            } else {
                message.error('Failed to save hotel config');
            }
        }
    };

    const handleHotelDelete = async (id) => {
        try {
            await apiClient.delete(endpoints.DELETE_HOTEL_PRICING_CONFIG(id));
            message.success('Hotel config deleted successfully');
            fetchHotels();
        } catch (error) {
            message.error('Failed to delete hotel config');
        }
    };

    // Handlers for Cars
    const showCarModal = (item = null) => {
        setEditingItem(item);
        if (item) {
            carForm.setFieldsValue(item);
        } else {
            carForm.resetFields();
            carForm.setFieldsValue({ is_active: true });
        }
        setIsCarModalVisible(true);
    };

    const handleCarSubmit = async () => {
        try {
            const values = await carForm.validateFields();
            if (editingItem) {
                await apiClient.put(endpoints.UPDATE_CAR_PRICING_CONFIG(editingItem.id), values);
                message.success('Car config updated successfully');
            } else {
                await apiClient.post(endpoints.CREATE_CAR_PRICING_CONFIG, values);
                message.success('Car config created successfully');
            }
            setIsCarModalVisible(false);
            fetchCars();
        } catch (error) {
            if (error.response?.data) {
                const errorMsg = Object.values(error.response.data).flat().join(', ');
                message.error(`Failed to save: ${errorMsg}`);
            } else if (error.errorFields) {
                // Form validation error
                return;
            } else {
                message.error('Failed to save car config');
            }
        }
    };

    const handleCarDelete = async (id) => {
        try {
            await apiClient.delete(endpoints.DELETE_CAR_PRICING_CONFIG(id));
            message.success('Car config deleted successfully');
            fetchCars();
        } catch (error) {
            message.error('Failed to delete car config');
        }
    };

    // Table Columns
    const hotelColumns = [
        { title: 'Hotel Name', dataIndex: 'hotel_name', key: 'hotel_name' },
        { title: 'Location', dataIndex: 'location', key: 'location' },
        { title: 'Hotel Tier', dataIndex: 'hotel_tier', key: 'hotel_tier' },
        { title: 'Room Type', dataIndex: 'room_type', key: 'room_type' },
        { title: 'Price/Night (₹)', dataIndex: 'price_per_night', key: 'price_per_night' },
        { title: 'Description', dataIndex: 'description', key: 'description' },
        { 
            title: 'Status', 
            dataIndex: 'is_active', 
            key: 'is_active',
            render: (isActive) => isActive ? <span style={{color: 'green'}}>Active</span> : <span style={{color: 'red'}}>Inactive</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button type="primary" icon={<EditOutlined />} size="small" onClick={() => showHotelModal(record)} />
                    <Button danger icon={<DeleteOutlined />} size="small" onClick={() => handleHotelDelete(record.id)} />
                </Space>
            ),
        },
    ];

    const carColumns = [
        { title: 'Price/KM (₹)', dataIndex: 'price_per_km', key: 'price_per_km' },
        { title: 'Description', dataIndex: 'description', key: 'description' },
        { 
            title: 'Status', 
            dataIndex: 'is_active', 
            key: 'is_active',
            render: (isActive) => isActive ? <span style={{color: 'green'}}>Active</span> : <span style={{color: 'red'}}>Inactive</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button type="primary" icon={<EditOutlined />} size="small" onClick={() => showCarModal(record)} />
                    <Button danger icon={<DeleteOutlined />} size="small" onClick={() => handleCarDelete(record.id)} />
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px', background: '#fff' }}>
            <h2>Quotation Pricing Configuration</h2>
            <br />
            
            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab}
                items={[
                    {
                        key: 'hotels',
                        label: 'Hotel Rates',
                        children: (
                            <>
                                <Button 
                                    type="primary" 
                                    icon={<PlusOutlined />} 
                                    onClick={() => showHotelModal()}
                                    style={{ marginBottom: 16 }}
                                >
                                    Add Hotel Rate
                                </Button>
                                <Table 
                                    columns={hotelColumns} 
                                    dataSource={hotels} 
                                    rowKey="id" 
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                />
                            </>
                        )
                    },
                    {
                        key: 'cars',
                        label: 'Car Travel Rates',
                        children: (
                            <>
                                <Button 
                                    type="primary" 
                                    icon={<PlusOutlined />} 
                                    onClick={() => showCarModal()}
                                    style={{ marginBottom: 16 }}
                                >
                                    Add Car Rate
                                </Button>
                                <Table 
                                    columns={carColumns} 
                                    dataSource={cars} 
                                    rowKey="id" 
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                />
                            </>
                        )
                    }
                ]}
            />

            {/* Hotel Modal */}
            <Modal
                title={editingItem ? "Edit Hotel Rate" : "Add Hotel Rate"}
                open={isHotelModalVisible}
                onOk={handleHotelSubmit}
                onCancel={() => setIsHotelModalVisible(false)}
            >
                <Form form={hotelForm} layout="vertical">
                    <Form.Item 
                        name="hotel_name" 
                        label="Hotel Name" 
                        rules={[{ required: true, message: 'Please enter hotel name' }]}
                    >
                        <Input placeholder="e.g. Hotel Taj Palace" />
                    </Form.Item>
                    <Form.Item 
                        name="location" 
                        label="Location (City)" 
                        rules={[{ required: true, message: 'Please enter location' }]}
                    >
                        <Input placeholder="e.g. Goa, Paris" />
                    </Form.Item>
                    <Form.Item 
                        name="hotel_tier" 
                        label="Hotel Tier" 
                        rules={[{ required: true, message: 'Please select a hotel tier' }]}
                    >
                        <Select placeholder="Select Tier">
                            <Option value="3-star">3-Star</Option>
                            <Option value="4-star">4-Star</Option>
                            <Option value="5-star">5-Star</Option>
                            <Option value="resort">Resort</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item 
                        name="room_type" 
                        label="Room Type" 
                        rules={[{ required: true, message: 'Please select room type' }]}
                    >
                        <Select placeholder="Select Room Type">
                            <Option value="single">Single Occupancy</Option>
                            <Option value="double">Double Sharing</Option>
                            <Option value="triple">Triple Sharing</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item 
                        name="price_per_night" 
                        label="Price Per Night (₹)" 
                        rules={[{ required: true, message: 'Please enter price per night' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name="is_active" label="Active" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Car Modal */}
            <Modal
                title={editingItem ? "Edit Car Rate" : "Add Car Rate"}
                open={isCarModalVisible}
                onOk={handleCarSubmit}
                onCancel={() => setIsCarModalVisible(false)}
            >
                <Form form={carForm} layout="vertical">
                    <Form.Item 
                        name="price_per_km" 
                        label="Price Per KM (₹)" 
                        rules={[{ required: true, message: 'Please enter price per km' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name="is_active" label="Active" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PricingConfig;
