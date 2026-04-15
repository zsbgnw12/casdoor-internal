// Copyright 2024 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

import React from "react";
import {Button, Form, Input} from "antd";
import {UserOutlined} from "@ant-design/icons";
import i18next from "i18next";

const TICKET_SYSTEM_LOGIN = "https://kind-forest-0138c3300.6.azurestaticapps.net/login";

class CustomerLoginPage extends React.Component {
  onFinish = (values) => {
    const code = (values.customerCode || "").trim();
    if (!code) {return;}
    const target = `${TICKET_SYSTEM_LOGIN}?customerCode=${encodeURIComponent(code)}&from=casdoor`;
    window.location.href = target;
  };

  render() {
    return (
      <Form
        name="customer_login"
        onFinish={this.onFinish}
        style={{width: "320px", margin: "0 auto"}}
      >
        <Form.Item
          name="customerCode"
          rules={[{required: true, message: i18next.t("login:Please input your customer ID!")}]}
        >
          <Input prefix={<UserOutlined />} placeholder={i18next.t("login:Customer ID")} />
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
