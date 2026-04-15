// Copyright 2024 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

import React from "react";
import {Button, Form, Input, message} from "antd";
import {LockOutlined, UserOutlined} from "@ant-design/icons";
import i18next from "i18next";

class CustomerLoginPage extends React.Component {
  onFinish = () => {
    message.info(i18next.t("login:Customer login is not available yet"));
  };

  render() {
    return (
      <Form
        name="customer_login"
        onFinish={this.onFinish}
        style={{width: "320px", margin: "0 auto"}}
      >
        <Form.Item
          name="customerId"
          rules={[{required: true, message: i18next.t("login:Please input your customer ID!")}]}
        >
          <Input prefix={<UserOutlined />} placeholder={i18next.t("login:Customer ID")} />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{required: true, message: i18next.t("login:Please input your password!")}]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder={i18next.t("login:Password")} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" style={{width: "100%"}}>
            {i18next.t("login:Sign In")}
          </Button>
        </Form.Item>
      </Form>
    );
  }
}

export default CustomerLoginPage;
